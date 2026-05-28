# Security / Correctness Review — Claude chat-mode profile (stream-json)

**Branch:** `feature/claude-chat-mode` (stacked on `feature/commands-tab-mirror`)
**Date:** 2026-05-27 (post-handoff continuation, third commit of the session)
**Scope:** New `api.anthropic.claude-chat` catalog entry that launches Claude CLI in `--print --input-format=stream-json --output-format=stream-json --verbose` mode; new `json-stream-parser.ts` with `JsonStreamParser` + `interpretClaudeChatEvent` + `encodeUserMessageJsonl`; `ChatSkinOverlay` gains a `profile` prop and routes JSON-stream profiles to the parser path; new `claude-chat` command family with intentionally-empty slash list; propagation through `TerminalTabs` → `EmbeddedTerminal` → `ChatSkinOverlay`.

Drains the last item from the post-handoff deferred list. After this
PR merges, the original 3-item handoff backlog is fully gone.

---

## Findings

### Critical

None. The change is additive — text-mode (default profile undefined or
`'claude'`) is unchanged; JSON-mode is only reached for the new catalog
entry, so existing Claude / Ollama / Aider / Gemini tabs behave
identically to PR #19.

### High

#### H-1 (assumption): Claude CLI flag surface not verified against current binary

**Where:** `src/main/model-catalog-seed.ts` — args `['--print', '--input-format=stream-json', '--output-format=stream-json', '--verbose']`.

**What:** The Anthropic SDK reference and the project's prior STATUS notes describe these flags as the canonical bidirectional JSONL mode for Claude. The CLI's exact accepted flag set hasn't been version-pinned in this PR and the user's local `claude` binary may be a different release. If the actual binary rejects one of these flags, the model launches and immediately exits (or prints a usage error), surfacing as a single error bubble in the chat skin.

**Why it matters:** The whole feature hinges on the CLI accepting these args. Failure mode is loud (the model tab errors out, the parse-error event surfaces in the bubble), so it's discoverable — but if the user assumed it would Just Work, they hit confusion.

**Mitigation in this PR:** Catalog entry's `recommendedFor` text explicitly calls out the JSON-mode purpose. Parser's `parse-error` events surface unexpected stdout (including CLI usage errors). If a flag is wrong, the user will see a clear "this CLI didn't accept the flags" signal in the first message bubble.

**Follow-up:** Add a one-shot `claude --help | grep -E 'stream-json|input-format'` probe on app launch that gates the catalog entry's visibility — out of scope for this commit.

---

### Medium

#### M-1: Tool-use / thinking content blocks silently dropped

**Where:** `json-stream-parser.ts:extractTextFromMessage` only collects `{type:'text', text:'...'}` blocks; any `tool_use`, `tool_result`, `thinking`, or other block type is skipped.

**What:** If Claude's response includes tool calls or extended thinking, the chat skin shows only the text part. The user sees an incomplete-looking response without an obvious indication that more was emitted.

**Why it matters:** Substantive. In `--print` mode tool usage is usually gated by `--allowedTools`, so without explicit opt-in tool blocks shouldn't appear — but if they do (e.g., MCP-driven flows), the skin under-represents the conversation.

**Fix scope (deferred):** Add a `tool_use` renderer (compact card showing tool name + input) and a `tool_result` renderer (collapsed by default, expandable to show output). Bundle with the next chat-skin iteration. The `ignore` action carries the raw event in the verifier output, so this is debuggable without code changes today.

#### M-2: No "stop generation" affordance in chat mode

**Where:** `ChatSkinOverlay` composer + `send()` callback. Chat mode submits JSON events but doesn't expose a way to interrupt mid-response.

**What:** If the user submits a long prompt and changes their mind, they have to toggle to terminal view and Ctrl+C — interrupting the whole CLI process rather than the in-flight generation.

**Why it matters:** UX papercut on long responses. Doesn't risk data loss; Claude completes the response if not interrupted.

**Fix scope (deferred):** Add a "Stop" pill that swaps into the send-button position while `isStreaming`. Wire it to either (a) send `\x03` (SIGINT) via PTY input, or (b) send a hypothetical `{"type":"abort"}` event if Claude's input-format-stream-json schema supports it. Determine empirically.

#### M-3: User-message echo dedup uses exact trim match

**Where:** `ChatSkinOverlay:applyClaudeAction` `new-user-message` branch dedups against the most recent user bubble via `recentUser.text.trim() === action.text.trim()`.

**What:** Works when the optimistic `send()` text matches the echo exactly. If the user sends multi-paragraph input and Claude's CLI normalizes whitespace (e.g., collapses consecutive newlines), the echo doesn't match — the user message appears twice.

**Why it matters:** Cosmetic but visible. The risk is low because the JSON encoder we send wraps the text as-is in `{type:'text', text}`, so Claude shouldn't normalize it — but the dedup is fragile to any normalization Claude does internally.

**Fix scope (deferred):** Use a more robust dedup (e.g., levenshtein distance < 5% of length, or a per-message UUID that round-trips). Acceptable risk in v1.

---

### Low

#### L-1: `JsonStreamParser.feed` buffer is unbounded

**Where:** `json-stream-parser.ts:JsonStreamParser.feed` accumulates bytes into `this.buffer` indefinitely until a newline arrives.

**What:** A pathological CLI that streams 1 GB without a newline would balloon the buffer until the renderer OOMs.

**Why it matters:** Not a realistic attack — Claude's CLI emits one event per line of typically ≤ 5 KB. But a bug in the CLI (or a malicious wrapper) could trigger this.

**Fix scope:** Add an optional `bounded: number` constructor arg that throws when the buffer exceeds the limit. ~10 lines. Defer until there's a real case.

#### L-2: `--verbose` flag may emit additional non-JSON logging

**Where:** `model-catalog-seed.ts` args include `--verbose`.

**What:** `--verbose` is included to ensure all event types fire (not just final `result`). Depending on what `--verbose` actually logs, it may add non-JSON lines mixed into stdout.

**Why it matters:** Parser handles these as `parse-error` events and surfaces them as italic bubbles, so the user sees them — but a flood of verbose lines could clutter the chat.

**Fix scope:** Empirically test in a follow-up. If `--verbose` adds noise, drop it from the catalog args. Currently included on the assumption it's needed for complete event coverage.

---

## Verification posture

- ✅ `npx tsc --noEmit` clean.
- ✅ `npx vite build` clean.
- ✅ `node scripts/runtime-verify.mjs` — 12 panels + 18 extended assertions still pass. No regression from PR #19.
- ⚠ **No end-to-end test of the actual JSON I/O contract** with a real Claude CLI binary — would require `claude` installed and authenticated on the verifier host. The catalog entry, parser, and renderer paths are unit-clean but the assumption that Claude accepts these flags + emits the expected event shapes is unverified in this PR.

The first manual run by the user should expose any flag-surface mismatch as a parse-error bubble within seconds; iterate the catalog args from there.

---

## Smoke list (manual)

Apply on top of PR #18 + PR #19 smoke lists:

1. Open the `▼` profile picker on a Claude tab. Search "claude". Two entries should appear: pinned "Claude" at top (`+` action) and "Claude (Chat)" in the API group.
2. Pick "Claude (Chat)". Wait for attach. Tab strip shows "Claude (Chat)".
3. EmbeddedTerminal renders the JSON output as raw text in xterm (this is expected — the skin overlay does the pretty rendering).
4. Toggle chat skin ON via the `✦ Chat` button. Header shows "Claude (Chat)" (per `derivePersonaLabel` matching). First bubble should be `_Claude JSON session ready._` (system init event).
5. Type "say hi" → send. User bubble appears immediately. Assistant bubble appears as Claude responds.
6. Open Commands sidebar → chip shows "CLAUDE (CHAT)" (text "Claude (Chat)"). All Commands tab shows the explanatory empty message.
7. Toggle skin OFF on the Claude (Chat) tab. Xterm shows the raw JSONL stream.
8. Open a regular Claude tab. Toggle skin ON. Confirm text-mode rendering still works (no regression).
9. Run `node scripts/runtime-verify.mjs` — 30 assertions still pass.

---

## Verdict

Ship. No Critical, one High-confidence assumption that's loudly self-
verifying on first run, two Mediums and two Lows tracked. The PR closes
the original 3-item deferred backlog from the morning handoff. Future
iterations can deepen the JSON renderer (tool blocks, stop button)
without re-architecting the seam — that's the value of the
parser/interpreter split.
