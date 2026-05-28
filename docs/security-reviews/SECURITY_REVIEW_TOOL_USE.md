# Security / Correctness Review — Tool-use / tool-result / thinking renderer

**Branch:** `feature/tool-use-renderer` (stacked on `feature/polish-m1s`)
**Date:** 2026-05-27 (post-handoff continuation, fifth commit of the session)
**Scope:** Closes M-1 from `SECURITY_REVIEW_CHAT_MODE.md`. Extends the chat-mode JSON renderer to surface `tool_use`, `tool_result`, and `thinking` content blocks as in-timeline cards instead of dropping them.

---

## What changed

- **`json-stream-parser.ts`**:
  - `ClaudeChatAction` gained `add-tool-use`, `add-tool-result`, `add-thinking` kinds.
  - `interpretClaudeChatEvent` returns `ClaudeChatAction[]` instead of a single action — assistant/user events fan out one action per content block.
  - New helpers: `contentBlocksToActions(content, role)` walks the array; `extractToolResultText(content)` flattens string/array content (images → `[image]` placeholder).
  - `extractTextFromMessage` removed (replaced by the per-block walk).
- **`ChatSkinOverlay.tsx`**:
  - `ChatMessage` gained optional `toolUse`, `toolResult`, `thinking` fields.
  - New `isPlainTextMessage` predicate so a text delta following a tool/thinking card starts a fresh bubble.
  - `applyClaudeAction` extended with new branches for the three new action kinds; existing dedup logic for `new-user-message` updated to ignore tool messages.
  - `MessageBubble` dispatches on the discriminators before the existing text path.
  - Three new card components — `ToolUseCard` (purple "🔧"), `ToolResultCard` (green "↩"), `ThinkingBlock` (muted dashed italic "💭"). All click-to-expand.
  - `ingestJsonChunk` consumes the action-array shape.

---

## Findings

### Critical / High

None. Change is additive to chat-mode only; text-mode and the existing
text-only chat-mode path stay unchanged.

### Medium

#### M-1: Tool cards don't visually pair with their results

**Where:** `ToolUseCard` and `ToolResultCard` render independently in the timeline. The tool_use_id is recorded in both but not surfaced visually.

**What:** When Claude does a tool_use → tool_result → tool_use → tool_result chain, the user has four cards stacked. Identifying which result belongs to which use requires reading the (currently-hidden) IDs.

**Why it matters:** Discoverability. Most flows have a strict order (tool_use immediately followed by tool_result) so it's usually obvious. Out-of-order or parallel tool calls would confuse.

**Fix scope (deferred):** Either (a) render tool_use + tool_result as a single combined card (mirror Claude's UI), or (b) draw a connecting line between paired cards, or (c) show the short id (e.g., `#a4b3`) in the card header. Tracked for the next chat-skin iteration.

#### M-2: `summarizeToolInput` field-priority list is hardcoded

**Where:** `summarizeToolInput()` in `ChatSkinOverlay.tsx` checks `file_path → path → filename → command → query → pattern → prompt → url` in order.

**What:** Future tool definitions might use different field names (`target_file`, `cmd`, `q`, etc.) and the summary falls back to listing the first 3 keys. Not wrong, just less helpful.

**Fix scope:** Extend the list as new tools surface in the wild. Or — better — let the tool definition declare which field is "the summary one" if/when we ingest tool schemas. Cosmetic.

#### M-3: Tool result image content silently becomes `[image]` placeholder

**Where:** `extractToolResultText()` flattens `{type:'image', ...}` blocks to the literal string `[image]`.

**What:** If a tool result returns a screenshot or rendered chart, the user sees `[image]` instead of the actual image.

**Why it matters:** Real-app value for vision-using tools (screenshot tools, image generators) is lost.

**Fix scope (deferred):** Add real image rendering with base64 / URL handling. Requires CSP review since images may come from external URLs.

### Low

#### L-1: Expanded JSON / output panes can grow large

**Where:** `ToolUseCard` JSON pane: `maxHeight: 240`. `ToolResultCard` output pane: `maxHeight: 320`. Both scroll internally.

**What:** A 100k-line tool result expands to a 320px box you scroll inside, which can feel cramped. Default is collapsed, so this only bites users who explicitly expand long outputs.

**Fix scope:** Could add a "Pop out" button that renders the content in a modal at full screen. Defer until a real use case shows up.

#### L-2: No "copy raw" button on expanded views

**Where:** Expanded JSON / output panes are select-only.

**What:** User can Ctrl-A + Ctrl-C inside the pane, which works on desktop. Less obvious than a button.

**Fix scope:** Add a "Copy" button on the expanded view. Bundle with the next chat-skin polish iteration.

---

## Verification

- ✅ `npx tsc --noEmit` clean.
- ✅ `npx vite build` clean.
- ✅ `node scripts/runtime-verify.mjs` — 30/30 assertions pass (12 panels + 18 extended).

End-to-end visual verification of the tool cards requires a Claude
session that actually emits tool_use blocks (i.e., Claude run with
`--allowedTools` or via MCP). The renderer code is pure-function +
React state — unit-clean — but the *visual* result is not exercised by
the CDP harness. Manual smoke when you have a real tool-using session.

---

## Smoke list (manual)

(On top of PR #21.)

1. Launch a "Claude (Chat)" tab. Confirm prior smoke still works:
   plain text exchange renders as before, system bubble fires on init.
2. If you can get Claude to use a tool (with `--allowedTools` set on
   the catalog args, or via an MCP profile that grants tools):
   - **Tool use:** Should see a purple `🔧 <toolname>` card with a
     one-line preview (path / command / etc.). Click to expand the
     full input JSON.
   - **Tool result:** Should see a green `↩ Tool result` card with a
     line count. Click to expand the output.
   - **Thinking:** Italic dashed-border `💭 Thinking` block. Click
     to expand reasoning text.
3. Tool cards stay aligned left even when interleaved with
   right-aligned user bubbles. Visual distinction from message bubbles
   is clear (different background, no avatar).
4. Toggling skin off → on doesn't lose the rendered cards (the chat
   state lives in component state, not the PTY scrollback).
5. `node scripts/runtime-verify.mjs` — 30 assertions still pass.

---

## Verdict

Ship. Closes the highest-priority remaining followup in
`STATUS.md` ("Tool-use / thinking renderer in chat skin"). Three
Medium follow-ups (pairing, summary fields, image rendering) tracked.
No new structural risk — the change is purely additive on the JSON
renderer path.
