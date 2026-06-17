# Security / Correctness Review — TerminalTabs wiring + session schema v2

**Branch:** `feature/terminal-tabs-wiring` (off `testing/master @ df7ac40`)
**Date:** 2026-05-27 (post-handoff continuation)
**Scope:** Wiring `TerminalTabs.tsx` into `App.tsx`, replacing the `SplitLayout` pane tree; bumping `SessionState` from v1 (`layout: SplitNode`) to v2 (`tabs + activeTabId`); migrating persisted v1 session files; rewiring `CommandPalette` from pane actions to tab actions; deleting `SplitLayout.tsx`.

This review follows the project's standing red-team-after-phase discipline.
Critical + High are fixed in the same commit; Medium + Low are documented
for follow-up.

---

## Findings

### Critical

#### C-1: Concurrent-mutation race in TerminalTabs add/close paths (FIXED in-commit)

**Where:** `src/renderer/components/terminal/TerminalTabs.tsx` — `addClaudeTab`, `addModelTab`, `closeTab` (pre-fix).

**What:** All three callbacks called `onTabsChange(<computed-from-closure-tabs>)`. Because `tabs` was captured at render time, a fast second gesture (user clicks `+` twice; user picks model A then immediately picks model B; user closes tab1 then opens a new tab via `+` while model A is still launching) would write a derived array based on the *pre-first-update* state, silently dropping the first tab.

`addModelTab`'s post-await success path was the worst case: it wrote `[...tabs, confirmedTab]` from a closure that didn't even include its own earlier placeholder — guaranteeing every concurrent gesture during the model-launch await window was lost.

**Why it matters:** `models.launch()` for an Ollama model can take 5–30 seconds (daemon start + GPU load + weights load). A reasonable user opens additional tabs during that wait. Losing them silently is a data-integrity bug, not just UX polish.

**Fix:**
- Changed `onTabsChange` prop type from `(next: TerminalTab[]) => void` to `React.Dispatch<React.SetStateAction<TerminalTab[]>>` so the updater-function form is in-API.
- `addClaudeTab`: `onTabsChange((prev) => [...prev, next])`.
- `addModelTab` insert: `onTabsChange((prev) => [...prev, placeholder])`.
- `addModelTab` failure: `onTabsChange((prev) => prev.filter((t) => t.id !== id))` — removes only the failing placeholder, leaves parallel tabs alone.
- `addModelTab` success: `onTabsChange((prev) => prev.map((t) => t.id === id ? {...t, paneId, ready: true} : t))` — in-place replacement, preserves order and parallel additions.
- `closeTab`: `onTabsChange((prev) => prev.filter((t) => t.id !== id))`.
- App.tsx passes `setTabs` directly (already a `Dispatch<SetStateAction>`); no caller-side change needed.

**Residual risk:** `closeTab`'s `onActiveChange` call still reads from the closure `tabs` to compute the focus fallback. The window is narrow (between the `await terminal.kill()` and the next React render) and the worst case is the user briefly seeing focus on a tab the persistence layer corrects on next save. Acceptable. Documented in M-2 below.

---

### High

#### H-1: Model PTYs lack `registerSender` plumbing — palette/snippet text injection silently dropped (DEFERRED)

**Where:** `TerminalTabs.tsx` line 254 renders `<EmbeddedTerminal paneId={t.paneId} compact={false} />` for non-Claude tabs. `EmbeddedTerminal` does not accept or call `registerSender`.

**What:** When a model tab is active, `sendersRef.current[activePaneId]` is `undefined`. `sendToActive` returns silently (line 240 of `App.tsx`). The palette "Insert: <snippet>" action becomes a no-op; the user gets no feedback that the input was discarded.

**Why it matters:** Failure is silent. The user types `Ctrl/Cmd+Shift+P`, picks a snippet, sees the palette close, sees nothing happen, and assumes the app is broken. Discoverability of "snippets only work on Claude tabs" is zero.

**Why deferred:** This is already item #3 in `docs/STATUS.md` "Deferred — pick up here" (Commands tab mirrors active model). The right fix wires `registerSender` into `EmbeddedTerminal` and likely adjusts what counts as "valid text to inject" per profile (an Ollama REPL probably wants different prompt handling than Claude). Bundling it into that follow-up keeps the change set coherent.

**Mitigation until then:** No UI changes — the failure mode is no worse than today (when SplitLayout didn't have model tabs at all). Documented in the new TerminalTabs LMM journal under "T3."

---

### Medium

#### M-1: No renderer-side cap on tab count

**Where:** `TerminalTabs.tsx` — `addClaudeTab` and `addModelTab` always append. The previous `handleSplit` in `App.tsx` enforced `MAX_PANES_RENDERER = 16` matching `PtyRegistry.MAX_PANES`. Removing `handleSplit` removed that check.

**What:** A user can open 17+ tabs. The 17th `terminal.spawn()` (for Claude) or `models.launch()` (for a model) will fail at the PtyRegistry layer; the renderer's response varies — for Claude tabs the tab appears but the PTY never emits `ready`, leaving a dead-looking terminal; for model tabs the failure surfaces via the `alert()` in `addModelTab`.

**Why it matters:** Inconsistent failure UX. Not a security issue.

**Fix scope (deferred):** Add a `MAX_TABS_RENDERER = 32` (matches the SessionService cap) check in `addClaudeTab` and `addModelTab`. Surface a toast/banner when blocked rather than silently appending a tab that won't connect. Could ship as a follow-up.

#### M-2: closeTab's onActiveChange uses closure tabs

**Where:** `TerminalTabs.tsx` `closeTab` callback after the C-1 fix.

**What:** After updating tabs via the updater function, the focus fallback (`remaining[remaining.length - 1]?.id`) is computed from the captured `tabs`. If a tab was added concurrently in the await window, the focus might briefly land on a deleted index instead of the new tab.

**Why it matters:** Cosmetic. The session-save debounce (250 ms) plus React's batching means the visible effect is a one-frame focus flash, then App.tsx's persistence write reconciles. No data loss.

**Fix scope (deferred):** Would require splitting the closeTab into a state-updater function that also computes the new active id, plus a follow-up `onActiveChange` driven by an effect. Net code growth not worth the user-invisible improvement.

#### M-3: CLI onboarding modal sends `/login` to the active tab regardless of profile

**Where:** `App.tsx` line 549-566 — `CliAuthOnboarding`'s `sendToActivePane` callback routes to `sendToActive` which uses the current `activePaneId`. The comment claims "the embedded PTY auto-spawns Claude, so the active pane is always a running Claude session" — that was true in the SplitLayout era.

**What:** If the user has a model tab active when the CLI onboarding modal opens, `/login` is typed into the ollama / aider / gemini REPL, which won't understand it.

**Why it matters:** The CLI onboarding only fires on first launch when `claude doctor` reports the CLI missing or unauthenticated — typically when the user has only one Claude tab. The race where they've already created a model tab before the modal opens is narrow. Failure is recoverable (user closes the model tab, opens a Claude tab, retries).

**Fix scope (deferred):** Before invoking `sendToActive`, check if `activePaneId`'s tab is a Claude tab; if not, switch focus to the first Claude tab found, or surface an error in the modal. Bundle with the next CLI-onboarding work.

---

### Low

#### L-1: `PlaceholderPanel.info` dict is empty dead code

**Where:** `App.tsx` line 617.

**What:** Every `SidebarPanel` id is now wired to a real component. `PlaceholderPanel` only renders if `RightPanel`'s `default:` branch fires, which it can't given the typed union. The `info` dict has been empty for a while.

**Fix scope:** Could delete in a doc-cleanup PR; left intact since it's harmless and the deletion churn would touch a section the user has been iterating on.

#### L-2: HotkeyAction enum lacks pane/tab actions

**Where:** `src/shared/types.ts` — `HotkeyAction = 'palette.open' | 'terminal.restart' | 'compact.toggle' | 'panel.lmm' | 'panel.github'`.

**What:** Tab actions (new, close, next, prev, reset) are palette-only. The `+` button advertises `Ctrl+Shift+T` in its title but no hotkey is bound.

**Fix scope:** Extend the enum, route through `dispatchAction`, expose in the hotkeys UI. Independent feature; not blocking.

---

## Migration safety check (session-service v1 → v2)

Manual cases walked through:

| Input v1 `state.layout` | Migrated v2 `tabs` / `activeTabId` | Notes |
|---|---|---|
| `{type:'pane', id:'p_root', cwd:null}` | `[{id:'tab_root', label:'Claude', paneId:'p_root', profile:'claude'}]` / `'tab_root'` | Reattaches to alive PTY on hot-reload. |
| `{type:'split', children:[{type:'pane', id:'p_root',…},{type:'pane', id:'p_2',…}]}` | Single Claude tab on `p_root` | `p_2`'s PTY was already killed on app quit; not orphaned. |
| Deeply nested split tree | Single Claude tab on first leaf's id (depth-first, left-biased) | Only one tab survives; rest are lost. Documented as expected behavior. |
| Missing `layout` field entirely | Single Claude tab on `p_root` | Falls back to default paneId. |
| Garbage / non-object `layout` | Single Claude tab on `p_root` | `extractFirstPaneId` returns null, fallback kicks in. |
| Forward-version session file (v3+) | Defaults (single Claude tab on `p_root`) | Refuses unknown future shapes; consistent with existing "from-the-future" handling. |

Sanitizer rejection checks:
- `paneId` violates `^[A-Za-z0-9_\-:]+$` → tab dropped.
- Two tabs with same `id` → only first kept.
- Two tabs with same `paneId` → only first kept.
- `profile !== 'claude'` → dropped (defense in depth; renderer also filters on write).
- Tab count > 32 → truncated.
- Resulting tab list empty → falls back to defaults.

Verdict: migration is safe; no path produces a writable state that subsequent sanitize would reject.

---

## Test coverage gaps

No automated tests are added by this change set (matches the repo's manual-QA posture for renderer work). Manual smoke list for verification at home:

1. Fresh install (no session.json): app boots into a single Claude tab. PTY spawns, prompt appears.
2. Open 2 more Claude tabs via `+`. Each spawns. Switching between them preserves scrollback.
3. Open a model via the `▼` picker. Tab strip shows "Launching …", then attaches.
4. While the model is launching, click `+` to add a Claude tab. After the model attaches, BOTH tabs should be present (C-1 verification).
5. Close a tab via `×`. PTY ends. Focus advances to the previous tab.
6. Palette → "Close tab", "New Claude tab", "Next tab", "Previous tab", "Reset tabs" all work.
7. Close the only tab — refused (empty-state never reached).
8. Quit app while on tab 2; relaunch. Tab 2 is restored as active. Model tabs are gone (expected).
9. With an existing v1 session.json on disk, launch the app. Logs in main should show a successful migrate; the first pane's id is preserved as the Claude tab's paneId.
10. Run `node scripts/runtime-verify.mjs` — all 12 sidebar tabs should still pass.

---

## Verdict

Ship after manual smoke step 4 (the C-1 fix verification). No Critical or High remains open; M-1/M-2/M-3 are tracked as deferred follow-ups, all with bounded blast radius.
