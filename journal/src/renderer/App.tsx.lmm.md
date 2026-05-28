# LMM — src/renderer/App.tsx

> File: `src/renderer/App.tsx` · LOC: ~680 ·
> Role: Root component. Owns the sidebar panel routing, the **tab list**
> for the terminal area (replaces the old SplitLayout pane tree), the
> sender-registry that lets palette/snippet text reach the active PTY,
> hotkey dispatch, popout-window short-circuit, CLI-onboarding gate,
> and the PTY-interceptor key-prompt surface.

## RAW

Previously a sub-200-LOC router. Today it's the renderer's integration
hub: it threads session state through TerminalTabs, hosts six top-level
modals (CommandPalette, ApiKeyModal, CliAuthOnboarding), short-circuits
into PopoutView when the renderer was loaded by `models:popout`, and
mediates between the main process's session/themes/auth/cli/hotkeys
services and the React tree.

Most-recent change (this session): replaced the SplitLayout-driven
`layout: SplitNode` state with a `tabs: TerminalTab[]` + `activeTabId`
pair. `activePaneId` — referenced by snippets, palette text injection,
the StatusBar PID readout, and the hotkey-restart action — is now
**derived** from `tabs.find(t => t.id === activeTabId)?.paneId`,
collapsing two sources of truth into one. The session schema bumped
v1 → v2 with a migration in `main/session-service.ts`.

The biggest non-obvious move in the file is the popout short-circuit
(lines 59-68). When the renderer is loaded by a `models:popout`
BrowserWindow, the URL has `?popout=<paneId>`. We return early before
*any* other hook fires, so popout windows don't waste cycles on session
load, theme apply, CLI onboarding, hotkey wiring, or interceptor
subscription. The popout window is just a thin frame around a single
TerminalPanel for the popped paneId — it doesn't know or care about the
tab strip.

Open questions:
- Should `handleNewClaudeTab` also receive a `cwd` arg so split-from-git
  workflows can open a Claude tab pre-`cd`'d? Currently it just spawns
  with the home dir. Likely a future enhancement.
- The `PlaceholderPanel` `info` dict is empty (line 617). It was a
  phase-tracking UI back in the 195-LOC era; today every panel is real,
  so the placeholder is dead code that survives only because the
  `default:` case in `RightPanel` returns it. Could be deleted; left
  in as a fallback for unknown panel ids.

## NODES

1. **Session state v2** (lines 70-83): four state hooks
   (`hydrated`, `activePanel`, `tabs`, `activeTabId`) plus three transient
   ones (`catalog`, `pidByPane`, `paletteOpen`, `bindings`). `activePaneId`
   is *derived*, not stored.

2. **DEFAULT_TABS bootstrap** (lines 49-51): one Claude tab on `p_root` so
   the renderer can show a terminal during the ~10ms between mount and
   `session.get()` resolving. The main-side `defaults()` returns the
   identical shape so post-hydrate the tab id is stable.

3. **Session save filters non-Claude tabs** (lines 162-184): model tabs
   carry an Ollama-spawned paneId that won't exist after app restart;
   persisting them would mislead the next hydrate into reattaching to
   dead PTYs. Filter at write; sanitize again at read. Defense in depth.

4. **CLI-onboarding gate** (lines 196-217): runs once post-hydrate; opens
   the `<CliAuthOnboarding>` modal when `claude doctor` reports the CLI
   missing or unauthenticated AND the user hasn't already dismissed it.
   The modal pipes `/login` to `sendToActive`, which routes via
   `sendersRef.current[activePaneId]` to the active TerminalPanel's PTY.

5. **PTY interceptor key-prompt subscription** (lines 425-449): listens
   for `provider-auth:key-prompt` IPC. When a spawned CLI prints an
   "Enter your API key" prompt the main-side recognizer caught, surface
   `<ApiKeyModal>` app-wide regardless of which sidebar panel is open.
   Only one modal at a time (lines 437-438).

6. **Hardcoded fallback hotkey** (lines 401-411): `Ctrl/Cmd+Shift+P` for
   the palette always works, even before the async `hotkeys.get()` has
   resolved. Otherwise users would be locked out of the palette during
   the first ~50ms post-mount.

7. **Tab actions** (lines 263-332):
   - `handleNewClaudeTab` — append a fresh tab with a new paneId, focus it.
   - `handleCloseActiveTab` — refuses to close the last tab; explicitly
     kills the PTY (TerminalPanel unmount doesn't auto-kill).
   - `handleFocusTab(delta)` — cyclic next/prev tab focus.
   - `handleResetTabs` — calls `session.reset()` in main, then kills any
     paneIds removed by the reset before restoring the new tabs list.

8. **Send-to-active gates on activePaneId** (lines 236-261): every text
   injection / restart path checks `if (!activePaneId) return` — if the
   user closes the last tab the sender map is empty and these are no-ops
   instead of crashes.

9. **Auto-fetch catalog on hydrate** (lines 120-126): the `+` profile
   picker in TerminalTabs needs `ModelDefinition[]`. We fetch via
   `models.list()` alongside session-restore; failure falls back to an
   empty catalog (picker just shows Claude).

### Tensions

- **T1: Stored vs derived `activePaneId`.** Storing it as separate state
  (the old pattern) made the focus-restart and StatusBar paths shorter
  but introduced a sync hazard every time tabs mutated. Resolved by
  deriving — every consumer reads from the same `tabs + activeTabId`
  truth source.

- **T2: Where to filter non-Claude tabs on persist.** Doing it only on
  read (sanitizer) leaves stale data on disk; doing it only on write
  trusts the on-disk shape. Resolved: both. Renderer write filters out
  model tabs; main sanitize-on-read drops anything that snuck through.

- **T3: Empty-tabs UX.** Should we ever permit `tabs.length === 0`?
  TerminalTabs has an empty-state CTA, but `handleCloseActiveTab` refuses
  the last close and `handleResetTabs` always lands with one Claude tab.
  Decision: never reach empty by user gesture; only via corrupted disk
  state (which sanitizer also patches). The CTA exists purely as a
  defense-in-depth landing pad.

## REFLECT

**Core insight:** App.tsx is the *renderer's integration ledger* — every
main-process service shows up here, every modal lives here, every cross-
component callback originates here. Its size is the inverse of how much
state lives in deeper components. The tab refactor *reduced* coupling
because `activePaneId` is now one derivation instead of two pieces of
state to keep coherent.

**Resolved tensions:**
- **T1:** Derive-don't-store wins when the source state is already in
  React and the consumer count is finite. The cost of a `Array.find`
  per render is negligible at 32 tabs max.
- **T2:** Defense-in-depth filtering is cheap insurance against future
  bugs that don't even exist yet — costs ~5 lines, prevents an entire
  class of "model tab silently respawning" reports.
- **T3:** The empty-tabs CTA is the right shape: don't crash, don't
  force a tab on the user, but make recovery a single click.

**Hidden assumptions:**
- `terminal.spawn(paneId, cwd)` is idempotent — calling it for an alive
  paneId re-attaches instead of duplicating the PTY. Documented in the
  PtyRegistry comment and exercised by hot-reload.
- `window.electronAPI.models.list()` returns the full catalog
  (`ModelDefinition[]`) synchronously enough that the `+` picker is
  populated by the time the user clicks it. The first paint flash is
  acceptable; the picker is hidden behind a click anyway.
- Theme application via `applyTheme()` sets CSS custom properties on
  `document.documentElement`. The renderer's inline styles use those
  vars, so theme changes propagate without component re-renders.

## SYNTHESIZE

**What this file does right:**
- One owner per cross-component invariant: tabs, sidebar panel, hotkey
  dispatch, session persistence, intercept-prompt routing.
- Defensive gates everywhere (`activePaneId &&`, sanitizer at every IPC
  boundary, try/catch around every renderer→main call).
- Derivation over duplication for `activePaneId`.

**Actionable follow-ups:**
1. **Wire EmbeddedTerminal sender registration** so palette / snippet
   text reaches model tabs (deferred — see STATUS.md item #3).
2. **Hotkey for new Claude tab** (`Ctrl+Shift+T`): would require
   extending `HotkeyAction` and routing through `dispatchAction`.
3. **Optional cwd for handleNewClaudeTab**: today every new Claude tab
   spawns in the home dir; opening one already-`cd`'d to the active git
   repo would match WorkingDirCard's selection.
4. **Delete the empty `PlaceholderPanel.info` dict** (line 617) once
   confirmed no other code path expects it — every `SidebarPanel` id is
   now wired to a real component.

**Risks:**
- Any new top-level modal needs to be mounted *after* the popout
  short-circuit return — modals mounted before line 68 would render in
  popout windows too, which we never want.
- The derived `activePaneId` recomputes on every `tabs` change. If
  `tabs` updates faster than React can batch (unlikely with our 250ms
  session-save debounce) this could thrash. Memoization would be
  premature; revisit if profiling shows it.

Related entries:
- [[TerminalTabs.tsx.lmm.md]] — the tab strip + content host this file
  drives.
- [[session-service.ts.lmm.md]] — the main-side counterpart that
  validates and migrates `SessionState` between v1 layout-tree and
  v2 tabs+activeTabId shapes.
