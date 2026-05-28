# Security / Correctness Review — Commands tab mirrors active model + H-1 fix

**Branch:** `feature/commands-tab-mirror` (stacked on `feature/terminal-tabs-wiring`)
**Date:** 2026-05-27 (post-handoff continuation, second commit of the session)
**Scope:** Makes the Commands sidebar panel render the slash + quick + shortcut tables that match the currently-active terminal tab's CLI (Claude / Ollama / Aider / Gemini / BitNet / unknown). Closes H-1 from `SECURITY_REVIEW_TERMINAL_TABS.md` by wiring `registerSender` into `EmbeddedTerminal`.

Same standing red-team-after-phase discipline as the parent PR. C/H
fixed in-commit; M/L documented.

---

## Findings

### Critical

None.

### High

#### H-1 (parent PR carry-over): `EmbeddedTerminal` lacks `registerSender` — RESOLVED

**Where it landed:** `src/renderer/components/models/EmbeddedTerminal.tsx` lines 24-32 (prop), 125-128 (register on mount), 138 (clear on unmount). Threaded through by `TerminalTabs.tsx`.

**What:** Model PTYs now register a sender under their `paneId`, so `App.sendToActive` reaches them. The palette's "Insert: <snippet>" action, the Commands sidebar's Quick Actions buttons, and the All Commands rows all work uniformly across Claude tabs and model tabs.

**Verification path:** smoke list step 5 below — focus an Ollama tab, click any quick action; the slash command lands in the REPL.

---

### Medium

#### M-1: Slash-command "starter" pattern is implicit

**Where:** `command-families.ts` Quick Actions for Aider (`/add `, `/drop `, `/run `, etc.) include a trailing space so the user lands mid-typing inside the REPL.

**What:** `App.sendToActive(text, submit=true)` in this code path appends `\r` (carriage return) to submit. For "starter" commands, the trailing space + the appended `\r` would submit *with* the trailing space and *no* argument — Aider would respond as if `/add ` (no path) was entered, which prints a usage error rather than letting the user type the path.

Looking at the trail: clicking a Quick Action calls `onSendCommand`, which in App.tsx is `handleSendCommand → sendToActive(text, true)`. The hardcoded `submit=true` means starters auto-submit empty.

**Why it matters:** UX papercut, not a security issue. A user clicking "Add file" sees Aider error out asking for a path; they then have to retype `/add <path>`.

**Fix scope (deferred):** Either (a) detect trailing-space commands in `handleSendCommand` and pass `submit=false` for them, OR (b) add a `submit: boolean` flag to `CommandDef` and respect it per entry. Option (b) is cleaner since the "starter vs complete" intent is per-command. Tracked in STATUS Deferred.

#### M-2: StatusBar PID display is 0 for model tabs

**Where:** `App.tsx:467` — `focusedPid = activePaneId ? (pidByPane[activePaneId] ?? 0) : 0`. `pidByPane` is fed by `TerminalPanel`'s `onReady` event, not by `EmbeddedTerminal`.

**What:** When a model tab is the active tab, the StatusBar shows PID 0 instead of the actual ollama / aider PID.

**Why it matters:** Cosmetic. Resource panel still tracks the model PTY bucket separately; the PID footer is informational only.

**Fix scope (deferred):** Either extend `EmbeddedTerminal` to subscribe to a hypothetical `onReady` (doesn't exist for already-launched PTYs), or have `Models` service push PID changes via a new IPC. Reasonable to bundle with the PID-tracking work mentioned in [[EmbeddedTerminal.tsx.lmm.md]].

#### M-3: Commands tab updates instantaneously on tab switch — possible focus surprise

**Where:** `App.tsx:RightPanel` re-renders when `activeCommandFamily` changes. `CommandsPanel` resets the expanded section via `useEffect`; `QuickCommands` resets the active category if it's not in the new family's `categories`.

**What:** Switching tabs while the Commands panel is open instantly swaps the visible commands. If the user was mid-click on `/clear` (Claude) and switched to an Ollama tab, the rendered button might rebind to a different `/clear` (Ollama, same slug — safe) or to a different command entirely (also safe — the new render simply replaces the old buttons).

**Why it matters:** No correctness issue (clicks fire `onSendCommand` synchronously with the rendered command); minor surprise factor.

**Fix scope (deferred):** Optional — add a brief fade animation on family change so the swap is visually announced. Cosmetic.

---

### Low

#### L-1: `deriveCommandFamily` falls back to `'unknown'` for every catalog entry whose `command` is non-canonical

**Where:** `command-families.ts:deriveCommandFamily` priority order: exact match on `command`, then `provider` substring, then `'unknown'`.

**What:** Catalog entries that ship a wrapper script (e.g., `command: 'my-aider-wrapper'`, `provider: 'Custom'`) fall to `'unknown'` and the user sees the generic empty-state.

**Why it matters:** Edge case; today's catalog uses canonical command names. If a user adds a custom model via the AddModelModal with a non-standard `command`, the Commands panel doesn't help — but the terminal still works.

**Fix scope:** Could add a `commandFamily?: CommandFamily` override field to `ModelDefinition` so authors can pin the family explicitly. Not worth doing until a real custom-wrapper case shows up.

#### L-2: Gemini slash-command list is sparse

**Where:** `command-families.ts:GEMINI_SLASH` has 3 entries.

**What:** Gemini's CLI may have more slash commands than I documented. The user sees a thin Quick Actions tab for Gemini.

**Why it matters:** Functionally fine (they can type directly); just less helpful than for Claude / Ollama / Aider.

**Fix scope:** Flesh out as we use Gemini more. Tracked in `command-families.ts` LMM SYNTHESIZE.

---

## Smoke list (manual)

Apply on top of PR #18's smoke list:

1. Open a Claude tab. Open the Commands sidebar. Header shows the "CLAUDE" chip; Quick Actions shows Model/Effort/Session pills; All Commands has the 5 sections (Model & Effort, Session, Workflow, Config, Info & Utils).
2. Click `/help` in All Commands → terminal receives `/help\r`. Claude prints help.
3. Open a new tab (`+`) — still Claude — Commands panel unchanged.
4. Open the picker (`▼`) and launch an Ollama model. Wait for attach. The Commands panel now shows "OLLAMA" chip, "Inspect/Session/Settings/Info" pills, and the Show/Session/Settings/Help sections.
5. **H-1 verification:** click "Model info" in Quick Actions. Terminal receives `/show info\r`. Ollama prints model info. (Before this PR: silent no-op.)
6. Click an Aider-launched tab (if you have Aider installed). Commands panel shows "AIDER" with Files/Mode/Git/Run/Session sections.
7. Try `/add ` — verify it lands typed-with-trailing-space then submits (M-1 papercut).
8. Switch back to a Claude tab — Commands panel reverts to Claude data; active category pill reverts to first valid pill ("Model").
9. Open palette → "Insert" a snippet → snippet text now reaches the active model tab (H-1).
10. `node scripts/runtime-verify.mjs` — all 12 sidebar tabs still pass.

---

## Verdict

Ship. H-1 closed in-commit; no Critical / High introduced. M-1/M-2/M-3
and the two Lows are tracked for follow-up with bounded scope.
