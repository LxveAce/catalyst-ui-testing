# LMM — src/renderer/components/chat-skin/json-stream-parser.ts

> File: `src/renderer/components/chat-skin/json-stream-parser.ts` · LOC: ~210 ·
> Role: Two pure modules. (1) `JsonStreamParser` — generic line-delimited
> JSON parser with partial-line buffering for the PTY chunked-input
> reality. (2) `interpretClaudeChatEvent` — Claude-specific event ⇒
> chat-renderer-action mapper. Plus `encodeUserMessageJsonl` for the
> outbound (stdin) wrap.

## RAW

Introduced for the "Claude chat-mode profile" — the last deferred item
from the post-handoff pickup. Before this, the chat-skin overlay
sanitized Claude's TUI bytes (ANSI escapes, screen clears, redraws)
into a best-effort chat view; it worked for static text but garbled
under live repaints. The clean fix is to run Claude with
`--input-format=stream-json --output-format=stream-json`, which gives a
bidirectional JSONL channel of structured events instead of a TUI.

The file contains two intentionally-separated concerns:

1. **Parsing** is *generic* JSONL — it doesn't know anything about
   Claude. Any future "Gemini chat mode" or "GPT chat mode" can reuse
   the parser and write its own interpreter.
2. **Interpreting** is Claude-specific — maps Anthropic SDK event
   shapes (`type: 'system' | 'user' | 'assistant' | 'result'`, plus
   the streaming `content_block_delta`) to a small set of
   `ClaudeChatAction` discriminators the overlay's `setMessages` updater
   can dispatch on.

3. **Encoding outbound user input** as a Claude SDK user-message JSON
   event with JSONL framing (`\n` terminator) so the overlay's send()
   path can swap one line of code instead of restructuring.

Open questions:
- Does Claude's CLI keep emitting `content_block_delta` events in
  `--print --output-format=stream-json` mode, or only the consolidated
  `assistant` / `result` shapes? The SDK reference shows both; the
  interpreter handles both forms.
- Are tool-use / tool-result blocks ever surfaced in plain `--print`
  mode? Probably not without `--allowedTools`. They're parsed as
  `ignore` events for now — the raw event lands in the debug log but
  isn't rendered. Add UI when there's a real use case.

## NODES

1. **Partial-line buffer** (`feed` lines 35-49): split on `\n`,
   `pop()` the trailing partial, parse the rest. Standard JSONL
   strategy. The buffer is unbounded — a pathological 1 GB single-line
   input would balloon it, but Claude's actual events are small. A
   bounded-buffer mode is a follow-up if anyone abuses this.

2. **`flush()` for EOF tails** (lines 53-65): when the PTY exits the
   last event may lack a trailing newline. `flush()` emits whatever
   remains; idempotent (the parser empties its buffer).

3. **`\r\n` tolerance**: lines get `.replace(/\r+$/, '').trim()` before
   JSON.parse — Windows-friendly without requiring the caller to
   normalize.

4. **Parse errors are events, not throws** (`parse-error` kind): the
   overlay can render or skip them. Critical for resilience — if
   Claude's CLI ever emits a banner or a deprecation warning on
   stderr that leaks into stdout, the parser keeps producing events
   for the next valid lines.

5. **Interpreter dispatch is by shape, not by type alone**: a `type:
   'result'` with `is_error: true` becomes an `error` action; with
   `is_error: false` it becomes `replace-last-assistant`. The decision
   reads multiple fields per event because Claude reuses `type`
   identifiers across very different payloads.

6. **`new-user-message` echo-dedup**: Claude echoes the user's input
   back as a `type: 'user'` event after parsing. The overlay's
   `applyClaudeAction` for this action de-duplicates against the most
   recent user bubble (which `send()` added optimistically). Subtle
   but needed — without it every user message would appear twice.

7. **`extractTextFromMessage` is forgiving**: returns null on any
   structural surprise rather than throwing. Handles the common
   `[{type:'text', text:'...'}]` shape; tool_use / thinking blocks
   skipped (no UI yet).

8. **`encodeUserMessageJsonl` mirrors the Anthropic Messages API
   user-message shape**: `{ type:'user', message:{ role:'user',
   content:[{type:'text', text}] } }` + `\n`. If Claude's CLI ever
   tightens its input schema (e.g., requires `id` or `model`), this
   is the single place to patch.

### Tensions

- **T1: Forgiving parser vs strict error surfacing.** A strict parser
  would throw on bad lines; a forgiving one swallows them. We chose
  forgiving + explicit `parse-error` events the consumer can route
  to UI or logs.
- **T2: Generic parser vs Claude-specific.** Keeping them in one file
  is a JS-style colocation convenience; the boundaries are clean
  enough that splitting later is trivial.
- **T3: Streaming deltas vs whole-message events.** Both arrive; the
  interpreter handles both. If Claude's CLI standardizes on one,
  remove the unused branch — until then, support both since the
  cost is ~6 lines.

## REFLECT

**Core insight:** Two small, pure modules with a narrow seam between
them (`JsonStreamEvent` → `interpretClaudeChatEvent` →
`ClaudeChatAction`). The overlay only sees the action discriminator,
never the raw JSON, so adding a new event type means one interpreter
edit + zero renderer edits. The cost is a forgiving stance everywhere
— but that matches how PTY-streamed data actually behaves in the wild.

**Resolved tensions:**
- **T1:** Forgiving was the right call. The first non-JSON line Claude
  emits (banner, warning, debug noise) would otherwise crash the
  overlay.
- **T2:** Same-file colocation is fine until a second profile (Gemini,
  GPT) lands; refactor then.
- **T3:** Supporting both shapes is cheap insurance.

**Hidden assumptions:**
- Claude's CLI emits one JSON value per line. True per the SDK docs
  for stream-json. If it ever switches to length-prefixed framing,
  this parser breaks loudly (JSON.parse fails on every line).
- Anthropic Messages API user-message shape is what stdin expects.
  Per the SDK reference; if Claude changes its CLI input contract,
  `encodeUserMessageJsonl` is the single edit point.

## SYNTHESIZE

**What this file does right:**
- Pure functions / pure data. Easy to unit-test (no tests yet — the
  current verification harness exercises the full overlay rather
  than this module alone).
- One responsibility per export.
- Forgiving error path so the overlay never blanks out from bad input.

**Actionable follow-ups:**
1. Add a unit-test suite for the parser (`tests/json-stream-parser.test.ts`
   or wherever the project lands on test infra) — it's small, pure,
   and high-value.
2. When tool-use UI is designed for the chat skin, extend
   `interpretClaudeChatEvent` to surface `tool_use` / `tool_result`
   blocks instead of dropping them as `ignore`.
3. Add a `bounded` option to `JsonStreamParser` that throws on
   buffer-too-large; useful for defensive deployments.

**Risks:**
- The interpreter's pattern-matching on Claude's JSON shape will rot
  if the CLI changes its event schema between versions. A failure
  here would manifest as everything getting interpreted as `ignore`
  — chat skin would show nothing. Mitigation: the `system` init
  event surfaces "Claude JSON session ready." so the user sees at
  least one bubble; further silence is a useful signal that the
  schema has drifted.
- The `extractTextFromMessage` function silently drops non-text
  content blocks. For the common case (pure text replies) this is
  fine; for tool-heavy workflows the user would wonder where the
  output went. Tracked in red-team.

Related entries:
- [[ChatSkinOverlay.tsx.lmm.md]] — the consumer.
- [[TerminalTabs.tsx.lmm.md]] — owns the active tab whose profile
  triggers chat-mode in the overlay.
