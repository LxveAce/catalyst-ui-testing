/**
 * Line-delimited JSON stream parser for chat-mode profiles.
 *
 * Claude CLI in `--output-format=stream-json` mode emits one JSON value
 * per line (newline-delimited / JSONL). Network PTY chunks split lines
 * mid-byte, so this parser buffers a partial-line tail across `feed()`
 * calls. Each complete line gets JSON.parse'd; failures are surfaced as
 * `parse-error` events rather than thrown — chat UIs need to keep
 * rendering even when the CLI emits stray non-JSON noise (banners,
 * warnings, stderr leaking through, etc.).
 *
 * Design choices:
 *   - **Forgiving over strict.** We never throw. A bad line returns a
 *     `parse-error` event the caller can render as raw text or skip.
 *   - **No size limit on the partial-line buffer.** Pathological input
 *     (a CLI that streams 1 GB without a newline) would balloon the
 *     buffer; in practice Claude emits one event per line of ~1-5 KB.
 *     A bounded buffer is a follow-up if this turns into a real issue.
 *   - **`\r\n` is tolerated** by trimming each split line before parse;
 *     same behavior as JSONL on Windows.
 *   - **Stateless except for the partial-line tail.** Caller owns the
 *     event log; the parser just produces events.
 *
 * Separate from `interpretClaudeChatEvent` below — parsing is generic;
 * the interpreter is Claude-specific so future profiles (gemini-chat?
 * gpt-chat?) can reuse the parser and write their own interpreter.
 */

export type JsonStreamEvent =
  | { kind: 'json'; value: unknown; raw: string }
  | { kind: 'parse-error'; raw: string; error: string };

export class JsonStreamParser {
  private buffer = '';

  /** Push the next chunk of bytes from the PTY. Returns zero or more
   *  events for the lines that completed in this chunk. */
  feed(chunk: string): JsonStreamEvent[] {
    if (!chunk) return [];
    this.buffer += chunk;
    const out: JsonStreamEvent[] = [];
    // Split on \n; the last segment may be incomplete and stays in the
    // buffer. `\r\n` is handled by trimming individual lines before parse.
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const rawLine of lines) {
      const line = rawLine.replace(/\r+$/, '').trim();
      if (!line) continue;
      try {
        const value = JSON.parse(line);
        out.push({ kind: 'json', value, raw: line });
      } catch (e) {
        out.push({
          kind: 'parse-error',
          raw: line,
          error: (e as Error).message ?? 'parse failed',
        });
      }
    }
    return out;
  }

  /** Force-emit whatever's in the buffer as one final event. Useful
   *  when the PTY exits and the last line lacks a terminating newline. */
  flush(): JsonStreamEvent[] {
    if (!this.buffer.trim()) {
      this.buffer = '';
      return [];
    }
    const line = this.buffer.replace(/\r+$/, '').trim();
    this.buffer = '';
    try {
      return [{ kind: 'json', value: JSON.parse(line), raw: line }];
    } catch (e) {
      return [{
        kind: 'parse-error',
        raw: line,
        error: (e as Error).message ?? 'parse failed',
      }];
    }
  }
}

// --- Claude chat-mode event interpreter -------------------------------------

/**
 * Action a parsed event maps to inside the chat-skin renderer.
 *
 * We deliberately keep this narrow:
 *   - `append-assistant-text` — add text to the *current* assistant
 *     message bubble (deltas), creating a new one if the previous bubble
 *     was a user message.
 *   - `replace-last-assistant` — overwrite the current assistant bubble
 *     (used when a complete message arrives that includes everything).
 *   - `new-user-message` — Claude echoes our user message back; surface
 *     it as a user bubble (but don't double-add if we already optimistically
 *     showed it on send).
 *   - `system` — informational; surface as a small system note or skip.
 *   - `error` — render as an error bubble.
 *   - `ignore` — known-uninteresting event (e.g., tool_use we don't yet
 *     have UI for); the raw event is still recorded in the debug log.
 */
export type ClaudeChatAction =
  | { kind: 'append-assistant-text'; text: string }
  | { kind: 'replace-last-assistant'; text: string }
  | { kind: 'new-user-message'; text: string }
  | { kind: 'system'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'ignore'; reason: string };

/**
 * Map a raw JSON event from the Claude CLI to one chat-renderer action.
 *
 * The CLI's exact stream-json schema is loosely documented and evolves
 * with the SDK; we recognize the common shapes:
 *
 *   { type: 'system', subtype: 'init', ... }                      → system note
 *   { type: 'user', message: { role: 'user', content: [...] } }   → echo of our input
 *   { type: 'assistant', message: { role: 'assistant', content: [{type:'text',text}] } }
 *                                                                  → assistant bubble
 *   { type: 'result', subtype: 'success', result: '...', is_error: false }
 *                                                                  → final assistant message
 *   { type: 'result', subtype: 'error_max_turns' | ..., is_error: true, ... }
 *                                                                  → error bubble
 *   { type: 'content_block_delta', delta: { type: 'text_delta', text: '...' } }
 *                                                                  → streaming text delta
 *
 * Unknown shapes fall back to `ignore` with a reason — caller can stash
 * them in a debug pane if it wants.
 */
export function interpretClaudeChatEvent(value: unknown): ClaudeChatAction {
  if (!value || typeof value !== 'object') {
    return { kind: 'ignore', reason: 'non-object event' };
  }
  const ev = value as Record<string, unknown>;
  const type = typeof ev.type === 'string' ? ev.type : null;

  // Streaming text deltas (Anthropic Messages API style).
  if (type === 'content_block_delta' && ev.delta && typeof ev.delta === 'object') {
    const d = ev.delta as Record<string, unknown>;
    if (d.type === 'text_delta' && typeof d.text === 'string') {
      return { kind: 'append-assistant-text', text: d.text };
    }
    return { kind: 'ignore', reason: `content_block_delta type=${String(d.type)}` };
  }

  // Whole assistant message (non-streaming success result or complete bubble).
  if (type === 'assistant' && ev.message && typeof ev.message === 'object') {
    const text = extractTextFromMessage(ev.message);
    if (text !== null) return { kind: 'replace-last-assistant', text };
    return { kind: 'ignore', reason: 'assistant message with no text content' };
  }

  // CLI echoes our user input back.
  if (type === 'user' && ev.message && typeof ev.message === 'object') {
    const text = extractTextFromMessage(ev.message);
    if (text !== null) return { kind: 'new-user-message', text };
    return { kind: 'ignore', reason: 'user message with no text content' };
  }

  // Final result event — also carries the assistant text.
  if (type === 'result') {
    const isError = ev.is_error === true;
    const text =
      typeof ev.result === 'string'
        ? ev.result
        : typeof ev.error === 'string'
        ? (ev.error as string)
        : '';
    if (isError) {
      return { kind: 'error', text: text || 'Claude reported an error.' };
    }
    if (text) return { kind: 'replace-last-assistant', text };
    return { kind: 'ignore', reason: 'result with no text payload' };
  }

  // System / init metadata.
  if (type === 'system') {
    const subtype = typeof ev.subtype === 'string' ? ev.subtype : 'system';
    // Init events fire on session start; surface as a small note so the
    // user knows the JSON channel is alive.
    if (subtype === 'init') {
      return { kind: 'system', text: 'Claude JSON session ready.' };
    }
    return { kind: 'ignore', reason: `system subtype=${subtype}` };
  }

  // Top-level error event (rare; usually wrapped in `result`).
  if (type === 'error') {
    const msg =
      typeof ev.error === 'string'
        ? (ev.error as string)
        : typeof ev.message === 'string'
        ? (ev.message as string)
        : 'Unknown error';
    return { kind: 'error', text: msg };
  }

  return { kind: 'ignore', reason: `unknown type=${type ?? '(missing)'}` };
}

/**
 * Pull a flat text string out of an Anthropic-style message object.
 * Messages look like `{ role, content: [{type:'text', text:'...'}, ...] }`.
 * Returns null if no text was found.
 */
function extractTextFromMessage(message: unknown): string | null {
  if (!message || typeof message !== 'object') return null;
  const m = message as Record<string, unknown>;
  const content = m.content;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as Record<string, unknown>;
    if (b.type === 'text' && typeof b.text === 'string') {
      parts.push(b.text);
    }
    // Future: tool_use, tool_result, thinking — render specially when
    // we have UI for them. For now they're invisible (logged via ignore).
  }
  return parts.length > 0 ? parts.join('') : null;
}

// --- User-input encoder -----------------------------------------------------

/**
 * Wrap a user's plain-text message as a JSON event the Claude CLI
 * expects on stdin in `--input-format=stream-json` mode. Mirrors the
 * Anthropic Messages API user-message shape.
 *
 * Returns the JSON string WITH a trailing newline (JSONL framing) so
 * the caller can pipe directly to `terminal.sendInput`.
 */
export function encodeUserMessageJsonl(text: string): string {
  const payload = {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text }],
    },
  };
  return JSON.stringify(payload) + '\n';
}
