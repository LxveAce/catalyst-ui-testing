import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

/**
 * Chat-skin overlay v2 — clean modern chat UI over the terminal pane.
 *
 * Design source: pattern-matched from multiple modern AI chats (Vercel
 * AI Chatbot, shadcn chat blocks, Pi.ai, Cursor, the Character.AI
 * reference the user shared). Intentionally NOT a copy of any one of
 * them — picks the common-denominator elements:
 *   - Persona header at top with a model badge + subtitle.
 *   - Centered narrow column (~720px) with generous whitespace.
 *   - Soft rounded bubbles for BOTH roles (no per-message avatars).
 *     User bubbles get a slight accent tint to distinguish.
 *   - Markdown rendering with syntax-highlighted code blocks.
 *   - Pill-shaped composer with a circular send button on the right.
 *   - Streaming caret on the latest assistant message.
 *   - 4-card empty state with suggested prompts.
 *
 * The skin sits on top of the same PTY the xterm uses; toggling off
 * reveals the terminal underneath with full scrollback intact.
 *
 * Echo + ANSI handling:
 *   - Strip CSI / OSC / cursor-movement escapes from incoming bytes
 *     for matching display only (the xterm gets raw bytes untouched).
 *   - Suppress the first chunk's leading-substring echo of what the
 *     user just sent (CLI input-echo from cooked-mode terminals).
 *   - Strip carriage-returns that the terminal would interpret as
 *     cursor-to-start-of-line; chat UI just wants newlines.
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
    title: 'Tour the codebase',
    subtitle: 'High-level walkthrough',
    prompt: 'Give me a tour of this repo. Start with the directory structure.',
  },
  {
    title: 'Debug an error',
    subtitle: 'Paste a stack trace',
    prompt: 'I hit this error:\n\n```\n```\n\nWhat\'s wrong?',
  },
  {
    title: 'Refactor something',
    subtitle: 'Improve existing code',
    prompt: 'Refactor ',
  },
  {
    title: 'Explain a concept',
    subtitle: 'TL;DR or deep dive',
    prompt: 'Explain ',
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
    // Decide BEFORE sanitizing whether this chunk contains a screen-clear
    // / alt-screen-enter sequence. When Claude (or any TUI) repaints, our
    // sanitizer would silently merge the new paint with the old text — the
    // user sees the same content "doubled up." Detecting the reset in the
    // RAW bytes (before stripping) lets us start a fresh assistant message.
    const startsNewPaint = /\x1b\[2J|\x1bc|\x1b\[\?1049[hl]|\x1b\[H/.test(rawData);

    let cleaned = sanitizeForChat(rawData);
    if (!cleaned) return;

    const last = lastSentRef.current;
    if (last && Date.now() - last.at < ECHO_SUPPRESS_WINDOW_MS) {
      const trimmedCleaned = cleaned.trimStart();
      if (trimmedCleaned.startsWith(last.text)) {
        cleaned = trimmedCleaned.slice(last.text.length).replace(/^[\r\n]+/, '');
      }
      lastSentRef.current = null;
    }
    if (!cleaned) return;

    setLastChunkAt(Date.now());
    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      // If the CLI just cleared the screen, start a fresh assistant
      // message so the new paint doesn't visually duplicate the old one.
      if (lastMsg && lastMsg.role === 'assistant' && !startsNewPaint) {
        const nextText = (lastMsg.text + cleaned).slice(0, MAX_MESSAGE_CHARS);
        // Also drop the previous message if the new full text starts with
        // it — that's the "redraw of the same content" case.
        if (lastMsg.text && cleaned.includes(lastMsg.text.trim().slice(0, 80))) {
          // Just replace with the new content instead of doubling.
          return [
            ...prev.slice(0, -1),
            { ...lastMsg, text: cleaned.slice(0, MAX_MESSAGE_CHARS) },
          ];
        }
        return [...prev.slice(0, -1), { ...lastMsg, text: nextText }];
      }
      return cap([
        ...prev,
        {
          id: makeId(),
          role: 'assistant',
          text: cleaned.slice(0, MAX_MESSAGE_CHARS),
          timestamp: Date.now(),
        },
      ]);
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
          { id: makeId(), role: 'user', text, timestamp: Date.now() },
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

  const personaLabel = useMemo(() => derivePersonaLabel(paneId), [paneId]);

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
      <SkinHeader label={personaLabel} onToggleOff={onToggleOff} />

      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: 'auto', padding: '20px 0 8px' }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: '0 auto',
            padding: '0 28px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {messages.length === 0 ? (
            <EmptyState
              label={personaLabel}
              onPickSuggestion={(p) => {
                setDraft(p);
                requestAnimationFrame(() => textareaRef.current?.focus());
              }}
            />
          ) : (
            messages.map((m, i) => (
              <MessageBubble
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
        placeholder={`Message ${personaLabel}…`}
      />

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

function SkinHeader({ label, onToggleOff }: { label: string; onToggleOff: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 18px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-primary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <PersonaAvatar size={26} />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '-0.005em',
            }}
          >
            {label}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
            Same PTY underneath — toggle off to see raw terminal
          </span>
        </div>
      </div>
      <button
        onClick={onToggleOff}
        title="Show terminal view"
        style={{
          padding: '5px 12px',
          borderRadius: 999,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          fontSize: 11,
        }}
      >
        Terminal
      </button>
    </div>
  );
}

function PersonaAvatar({ size = 32 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        background: 'var(--accent-gradient)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        flexShrink: 0,
        boxShadow: 'var(--shadow-glow, 0 0 16px rgba(124,58,237,0.25))',
      }}
    >
      <svg
        width={size * 0.5}
        height={size * 0.5}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 2 L14 9 L21 11 L14 13 L12 20 L10 13 L3 11 L10 9 Z" />
      </svg>
    </div>
  );
}

function MessageBubble({ message, showCursor }: { message: ChatMessage; showCursor: boolean }) {
  const isUser = message.role === 'user';
  // Detect Claude/Codex/Aider-style interactive selection prompts. These
  // require keyboard-only responses (Enter / Esc / numeric pick) that the
  // chat skin's send-text path can't deliver cleanly. Surface a callout
  // pointing the user back to Terminal view rather than letting them
  // type something that won't work.
  const looksInteractive =
    !isUser && /(Enter to confirm|Esc to cancel|↵ to confirm|press enter|Select an option|❯\s*\d|\b\d\.\s.+\s\d\.\s)/i.test(
      message.text
    );
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {looksInteractive && <InteractivePromptBanner />}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 18,
            background: isUser
              ? 'var(--accent-dim, rgba(124,58,237,0.16))'
              : 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontSize: 15,
            lineHeight: 1.65,
            wordBreak: 'break-word',
          }}
        >
          {isUser ? (
            <div style={{ whiteSpace: 'pre-wrap' }}>{message.text}</div>
          ) : (
            <>
              <AssistantMarkdown text={message.text} />
              {showCursor && <span className="ccs-chat-caret" />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InteractivePromptBanner() {
  return (
    <div
      style={{
        padding: '8px 12px',
        borderRadius: 10,
        background: 'rgba(251, 191, 36, 0.10)',
        border: '1px solid rgba(251, 191, 36, 0.35)',
        fontSize: 12,
        lineHeight: 1.5,
        color: '#fcd34d',
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
      }}
    >
      <span aria-hidden="true">⚠</span>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>
          The CLI is waiting for an interactive choice
        </div>
        <div style={{ color: 'rgba(252,211,77,0.85)' }}>
          Selection menus need keyboard-only responses (Enter / Esc / arrow keys / number picks).
          Click "Terminal" in the header to respond, then come back here.
        </div>
      </div>
    </div>
  );
}

function AssistantMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code: CodeRenderer,
        p: ({ children }) => <p style={{ margin: '0 0 10px' }}>{children}</p>,
        ul: ({ children }) => (
          <ul style={{ margin: '0 0 10px', paddingLeft: 22 }}>{children}</ul>
        ),
        ol: ({ children }) => (
          <ol style={{ margin: '0 0 10px', paddingLeft: 22 }}>{children}</ol>
        ),
        li: ({ children }) => <li style={{ marginBottom: 3 }}>{children}</li>,
        h1: ({ children }) => <h2 style={mdHeadingStyle(20)}>{children}</h2>,
        h2: ({ children }) => <h3 style={mdHeadingStyle(17)}>{children}</h3>,
        h3: ({ children }) => <h4 style={mdHeadingStyle(15)}>{children}</h4>,
        a: ({ children, href }) => (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              if (typeof href === 'string') {
                void window.electronAPI.models
                  .openExternal(href)
                  .catch(() => undefined);
              }
            }}
            style={{
              color: 'var(--accent-light)',
              textDecoration: 'underline',
            }}
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote
            style={{
              margin: '0 0 10px',
              padding: '4px 12px',
              borderLeft: '2px solid var(--border-active)',
              color: 'var(--text-secondary)',
            }}
          >
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div style={{ overflowX: 'auto', margin: '0 0 10px' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th
            style={{
              border: '1px solid var(--border)',
              padding: '6px 10px',
              textAlign: 'left',
            }}
          >
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td style={{ border: '1px solid var(--border)', padding: '6px 10px' }}>
            {children}
          </td>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function mdHeadingStyle(size: number): React.CSSProperties {
  return {
    margin: '14px 0 8px',
    fontSize: size,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: 'var(--text-primary)',
  };
}

function CodeRenderer({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement> & {
  className?: string;
  children?: React.ReactNode;
}) {
  const raw = String(children ?? '');
  const isBlock = raw.includes('\n') || /language-/.test(className ?? '');
  if (!isBlock) {
    return (
      <code
        style={{
          background: 'rgba(255,255,255,0.08)',
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
        borderRadius: 10,
        margin: '10px 0',
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
          onClick={() => {
            void navigator.clipboard
              .writeText(codeText)
              .catch(() => undefined);
          }}
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

function EmptyState({
  label,
  onPickSuggestion,
}: {
  label: string;
  onPickSuggestion: (prompt: string) => void;
}) {
  return (
    <div
      style={{
        margin: 'auto',
        maxWidth: 560,
        textAlign: 'center',
        padding: '40px 8px 0',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <PersonaAvatar size={48} />
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: 'var(--text-primary)',
          marginBottom: 6,
        }}
      >
        Chat with {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          marginBottom: 28,
          lineHeight: 1.5,
        }}
      >
        Same CLI underneath. Toggle off any time to see the raw terminal.
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
              borderRadius: 14,
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
            <div
              style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}
            >
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
  placeholder,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  draft: string;
  setDraft: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
}) {
  const hasContent = draft.trim().length > 0;
  return (
    <div style={{ padding: '0 20px 18px', background: 'transparent' }}>
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          // Pill shape: large radius so single-line inputs look round; the
          // border-radius doesn't change as the textarea grows, but the
          // visual stays soft-rounded.
          borderRadius: 24,
          padding: '8px 8px 8px 18px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        }}
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
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
            padding: '6px 0',
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
            // Perfectly round send button — matches the pill composer's
            // visual language. 32×32 = roomy enough for the arrow icon
            // without crowding adjacent input text.
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: 'none',
            background: hasContent
              ? 'var(--accent-gradient)'
              : 'rgba(255,255,255,0.08)',
            color: hasContent ? '#fff' : 'var(--text-secondary)',
            cursor: hasContent ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 120ms, background 120ms',
            flexShrink: 0,
            boxShadow: hasContent
              ? 'var(--shadow-glow, 0 0 16px rgba(124,58,237,0.35))'
              : 'none',
          }}
          onMouseDown={(e) => {
            if (hasContent) e.currentTarget.style.transform = 'scale(0.92)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = '';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = '';
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ----- Helpers -----

function derivePersonaLabel(paneId: string): string {
  if (paneId === 'p_root' || paneId.startsWith('p_')) return 'Claude';
  if (paneId.startsWith('model:')) {
    const rest = paneId.slice(6);
    const dash = rest.lastIndexOf('-');
    const id = dash > 0 ? rest.slice(0, dash) : rest;
    // Replace underscores + dashes with spaces, title-case-ish.
    return id
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }
  return paneId;
}

function makeId(): string {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cap(arr: ChatMessage[]): ChatMessage[] {
  return arr.length > MAX_MESSAGES
    ? arr.slice(arr.length - MAX_MESSAGES)
    : arr;
}

/**
 * Aggressive sanitize for the chat-skin display path. Strips:
 *   - CSI sequences (`\x1b[…`),
 *   - OSC sequences (`\x1b]…\x07`),
 *   - DCS / SOS / PM / APC (`\x1b[PX^_]…\x1b\\`),
 *   - bare ESC bytes, BEL, NUL,
 *   - carriage-return-only lines (terminal uses them to overwrite a
 *     line in place; chat UI wants the final text only),
 *   - excess blank lines (3+ → 2).
 */
function sanitizeForChat(s: string): string {
  let out = s;
  // CSI / OSC / DCS / SOS / APC.
  // eslint-disable-next-line no-control-regex
  out = out.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  // eslint-disable-next-line no-control-regex
  out = out.replace(/\x1b\][^\x07]*\x07/g, '');
  // eslint-disable-next-line no-control-regex
  out = out.replace(/\x1b[PX^_].*?\x1b\\/g, '');
  // Bare ESC, BEL, NUL.
  // eslint-disable-next-line no-control-regex
  out = out.replace(/[\x00\x07\x1b]/g, '');
  // Carriage-return-overwrite: split on \r and keep the last segment per
  // line (terminals use \rfoo\rbar to overwrite "foo" with "bar"). We
  // ignore \r when not followed by \n, then re-tokenize as text.
  out = out.replace(/[^\r\n]*\r(?!\n)/g, '');
  // Collapse runs of 3+ newlines to 2 for chat-friendly spacing.
  out = out.replace(/\n{3,}/g, '\n\n');
  return out;
}
