import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

/**
 * Chat-skin overlay — modern AI-chat presentation over the terminal pane.
 *
 * Redesign (post-user-feedback "looks horrible"):
 *   - Full-width message rows, NOT iMessage bubbles. Assistant rows have a
 *     left-side 28×28 avatar and unstyled prose. User rows have a subtle
 *     translucent bubble (rounded-2xl with sharper bottom-right corner).
 *   - System sans-serif (Söhne/Inter fallback chain) at 15px / 1.7
 *     line-height. Markdown rendered via react-markdown + remark-gfm.
 *   - Code blocks via Prism (react-syntax-highlighter) with a language
 *     header bar + copy button. Inline code via subtle background.
 *   - 768px-max centered column for both messages and the composer.
 *   - Empty state: "What can I help with?" + 4 suggestion cards.
 *   - Streaming cursor: blinking ▍ at end of the latest assistant message.
 *
 * Same PTY underneath: subscribes to `terminal.onData` for output, writes
 * input via `terminal.sendInput`. Toggle off → xterm with full history.
 */

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

interface Props {
  paneId: string;
  visible: boolean;
  onToggleOff: () => void;
}

const MAX_MESSAGES = 200;
const MAX_MESSAGE_CHARS = 100_000;
const ECHO_SUPPRESS_WINDOW_MS = 1500;
const STREAMING_TAIL_MS = 800;

const SUGGESTIONS: Array<{ title: string; subtitle: string; prompt: string }> = [
  {
    title: 'Explain the codebase',
    subtitle: 'Get a high-level tour',
    prompt: 'Give me a tour of this repo. Start with the directory structure.',
  },
  {
    title: 'Fix a bug',
    subtitle: 'Paste a stack trace',
    prompt: 'I have a bug:\n\n',
  },
  {
    title: 'Write a function',
    subtitle: 'Describe what you need',
    prompt: 'Write a function that ',
  },
  {
    title: 'Run a command',
    subtitle: 'Ask the CLI to execute',
    prompt: '',
  },
];

const FONT_STACK =
  '"Söhne", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const MONO_STACK =
  '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", monospace';

export function ChatSkinOverlay({ paneId, visible, onToggleOff }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [lastChunkAt, setLastChunkAt] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSentRef = useRef<{ text: string; at: number } | null>(null);

  useEffect(() => {
    const unsub = window.electronAPI.terminal.onData(paneId, (data) => {
      appendAssistantChunk(data);
    });
    return () => {
      try {
        unsub();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId]);

  const appendAssistantChunk = useCallback((rawData: string) => {
    let cleaned = stripAnsi(rawData).replace(/^\r/, '');
    if (!cleaned) return;

    const last = lastSentRef.current;
    if (last && Date.now() - last.at < ECHO_SUPPRESS_WINDOW_MS) {
      if (cleaned.startsWith(last.text)) {
        cleaned = cleaned.slice(last.text.length).replace(/^[\r\n]+/, '');
      }
      lastSentRef.current = null;
    }
    if (!cleaned) return;

    setLastChunkAt(Date.now());
    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        const nextText = (lastMsg.text + cleaned).slice(0, MAX_MESSAGE_CHARS);
        return [...prev.slice(0, -1), { ...lastMsg, text: nextText }];
      }
      const next: ChatMessage = {
        id: makeId(),
        role: 'assistant',
        text: cleaned.slice(0, MAX_MESSAGE_CHARS),
        timestamp: Date.now(),
      };
      return cap([...prev, next]);
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, visible]);

  const send = useCallback(
    (textOverride?: string) => {
      const text = (textOverride ?? draft).trim();
      if (!text) return;
      setMessages((prev) =>
        cap([
          ...prev,
          {
            id: makeId(),
            role: 'user',
            text,
            timestamp: Date.now(),
          },
        ])
      );
      lastSentRef.current = { text, at: Date.now() };
      try {
        window.electronAPI.terminal.sendInput(paneId, text + '\r');
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: 'assistant',
            text: '⚠ Could not deliver to the terminal (PTY unavailable).',
            timestamp: Date.now(),
          },
        ]);
      }
      setDraft('');
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.style.height = '24px';
          el.focus();
        }
      });
    },
    [draft, paneId]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const isStreaming = useMemo(() => {
    if (lastChunkAt === 0) return false;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return false;
    return Date.now() - lastChunkAt < STREAMING_TAIL_MS;
  }, [messages, lastChunkAt]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
        fontFamily: FONT_STACK,
        color: 'var(--text-primary)',
      }}
    >
      <SkinHeader paneId={paneId} onToggleOff={onToggleOff} />

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 0',
        }}
      >
        <div
          style={{
            maxWidth: 768,
            margin: '0 auto',
            padding: '0 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 28,
          }}
        >
          {messages.length === 0 ? (
            <EmptyState onPickSuggestion={(p) => { setDraft(p); textareaRef.current?.focus(); }} />
          ) : (
            messages.map((m, i) => (
              <MessageRow
                key={m.id}
                message={m}
                showCursor={isStreaming && i === messages.length - 1}
              />
            ))
          )}
        </div>
      </div>

      <Composer
        textareaRef={textareaRef}
        draft={draft}
        setDraft={setDraft}
        onSend={() => send()}
        onKeyDown={handleKeyDown}
      />

      {/* Blinking caret + streaming cursor keyframes */}
      <style>{`
        @keyframes ccs-chat-blink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
        .ccs-chat-caret {
          display: inline-block;
          width: 6px; height: 0.95em;
          margin-left: 2px;
          vertical-align: text-bottom;
          background: var(--accent);
          animation: ccs-chat-blink 1s steps(2) infinite;
        }
      `}</style>
    </div>
  );
}

// ----- Sub-components -----

function SkinHeader({ paneId, onToggleOff }: { paneId: string; onToggleOff: () => void }) {
  // Pull model/CLI label from paneId. Format: "p_root" (claude), "model:<id>-<ts>"
  const label = useMemo(() => {
    if (paneId === 'p_root' || paneId.startsWith('p_')) return 'Claude Code';
    if (paneId.startsWith('model:')) {
      const rest = paneId.slice(6);
      const dash = rest.lastIndexOf('-');
      return dash > 0 ? rest.slice(0, dash) : rest;
    }
    return paneId;
  }, [paneId]);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-primary)',
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text-primary)',
          letterSpacing: '-0.005em',
        }}
      >
        {label}
      </div>
      <button
        onClick={onToggleOff}
        title="Show terminal view"
        style={{
          padding: '4px 10px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          fontSize: 11,
        }}
      >
        Terminal view
      </button>
    </div>
  );
}

function MessageRow({ message, showCursor }: { message: ChatMessage; showCursor: boolean }) {
  if (message.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          style={{
            maxWidth: 'min(80%, 56ch)',
            padding: '10px 14px',
            borderRadius: '18px 18px 6px 18px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontSize: 15,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {message.text}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <AssistantAvatar />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 15,
          lineHeight: 1.7,
          color: 'var(--text-primary)',
          wordBreak: 'break-word',
        }}
      >
        <AssistantMarkdown text={message.text} />
        {showCursor && <span className="ccs-chat-caret" />}
      </div>
    </div>
  );
}

function AssistantAvatar() {
  return (
    <div
      style={{
        flexShrink: 0,
        width: 28,
        height: 28,
        borderRadius: 8,
        background: 'var(--accent-dim, rgba(124,58,237,0.18))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--accent-light)',
        marginTop: 2,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2 L14 9 L21 11 L14 13 L12 20 L10 13 L3 11 L10 9 Z" />
      </svg>
    </div>
  );
}

function AssistantMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code: CodeRenderer,
        p: ({ children }) => <p style={{ margin: '0 0 12px' }}>{children}</p>,
        ul: ({ children }) => <ul style={{ margin: '0 0 12px', paddingLeft: 24 }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ margin: '0 0 12px', paddingLeft: 24 }}>{children}</ol>,
        li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
        h1: ({ children }) => <h2 style={mdHeadingStyle(20)}>{children}</h2>,
        h2: ({ children }) => <h3 style={mdHeadingStyle(18)}>{children}</h3>,
        h3: ({ children }) => <h4 style={mdHeadingStyle(16)}>{children}</h4>,
        a: ({ children, href }) => (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              if (typeof href === 'string') {
                void window.electronAPI.models.openExternal(href).catch(() => undefined);
              }
            }}
            style={{ color: 'var(--accent-light)', textDecoration: 'underline' }}
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote
            style={{
              margin: '0 0 12px',
              padding: '4px 12px',
              borderLeft: '2px solid var(--border-active)',
              color: 'var(--text-secondary)',
            }}
          >
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div style={{ overflowX: 'auto', margin: '0 0 12px' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th style={{ border: '1px solid var(--border)', padding: '6px 10px', textAlign: 'left' }}>{children}</th>
        ),
        td: ({ children }) => (
          <td style={{ border: '1px solid var(--border)', padding: '6px 10px' }}>{children}</td>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function mdHeadingStyle(size: number): React.CSSProperties {
  return {
    margin: '16px 0 8px',
    fontSize: size,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: 'var(--text-primary)',
  };
}

// `code` component renderer for react-markdown. ReactMarkdown v9 passes
// `inline` via the node's position rather than a prop; we detect via
// the presence of a newline + className regex.
function CodeRenderer({ className, children, ...rest }: React.HTMLAttributes<HTMLElement> & { className?: string; children?: React.ReactNode }) {
  const raw = String(children ?? '');
  const isBlock = raw.includes('\n') || /language-/.test(className ?? '');
  if (!isBlock) {
    return (
      <code
        style={{
          background: 'rgba(255,255,255,0.07)',
          padding: '1px 6px',
          borderRadius: 4,
          fontSize: '0.875em',
          fontFamily: MONO_STACK,
        }}
        {...rest}
      >
        {children}
      </code>
    );
  }
  const lang = /language-(\w+)/.exec(className ?? '')?.[1] || 'text';
  const codeText = raw.replace(/\n$/, '');
  return (
    <div
      style={{
        background: '#0a0a14',
        border: '1px solid var(--border)',
        borderRadius: 8,
        margin: '12px 0',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 12px',
          borderBottom: '1px solid var(--border)',
          fontSize: 11,
          color: 'var(--text-secondary)',
        }}
      >
        <span style={{ fontFamily: FONT_STACK }}>{lang}</span>
        <button
          onClick={() => { void navigator.clipboard.writeText(codeText).catch(() => undefined); }}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 11,
            padding: 0,
            fontFamily: FONT_STACK,
          }}
        >
          Copy
        </button>
      </div>
      <SyntaxHighlighter
        language={lang}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '12px 14px',
          background: 'transparent',
          fontSize: 13,
          lineHeight: 1.5,
          fontFamily: MONO_STACK,
        }}
        PreTag="div"
      >
        {codeText}
      </SyntaxHighlighter>
    </div>
  );
}

function EmptyState({ onPickSuggestion }: { onPickSuggestion: (prompt: string) => void }) {
  return (
    <div
      style={{
        margin: 'auto',
        maxWidth: 580,
        textAlign: 'center',
        padding: '60px 16px 0',
      }}
    >
      <div
        style={{
          fontSize: 32,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: 'var(--text-primary)',
          marginBottom: 8,
        }}
      >
        What can I help with?
      </div>
      <div
        style={{
          fontSize: 14,
          color: 'var(--text-secondary)',
          marginBottom: 32,
          lineHeight: 1.5,
        }}
      >
        Ask a question, write code, or explore ideas. The terminal stays live underneath.
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          textAlign: 'left',
        }}
      >
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            onClick={() => onPickSuggestion(s.prompt)}
            style={{
              padding: '12px 14px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              cursor: 'pointer',
              transition: 'all 150ms',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 500 }}>{s.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {s.subtitle}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Composer({
  textareaRef,
  draft,
  setDraft,
  onSend,
  onKeyDown,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  draft: string;
  setDraft: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const hasContent = draft.trim().length > 0;
  return (
    <div style={{ padding: '0 16px 20px', background: 'transparent' }}>
      <div
        style={{
          maxWidth: 768,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 18,
          padding: '10px 10px 10px 16px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
        }}
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask anything"
          rows={1}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: 15,
            lineHeight: 1.5,
            fontFamily: 'inherit',
            resize: 'none',
            minHeight: 24,
            maxHeight: 200,
            padding: '4px 0',
            overflowY: 'auto',
          }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = '24px';
            el.style.height = Math.min(200, el.scrollHeight) + 'px';
          }}
        />
        <button
          onClick={onSend}
          disabled={!hasContent}
          title="Send (Enter)"
          aria-label="Send"
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            border: 'none',
            background: hasContent ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
            color: hasContent ? '#fff' : 'var(--text-secondary)',
            cursor: hasContent ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 120ms, background 120ms',
            flexShrink: 0,
          }}
          onMouseDown={(e) => {
            if (hasContent) e.currentTarget.style.transform = 'scale(0.95)';
          }}
          onMouseUp={(e) => { e.currentTarget.style.transform = ''; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = ''; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ----- Helpers -----

function makeId(): string {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cap(arr: ChatMessage[]): ChatMessage[] {
  return arr.length > MAX_MESSAGES ? arr.slice(arr.length - MAX_MESSAGES) : arr;
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b[PX^_].*?\x1b\\/g, '');
}
