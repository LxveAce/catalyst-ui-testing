# Session log — 2026-05-27 night (post-handoff pickup)

Continuation of the evening session (see
`SESSION_LOG_2026-05-27_evening.md`). The evening shipped chat-skin v2,
GPU routing, auth auto-detect, BitNet, the TerminalTabs scaffolding, and
v3.1.0. The user resumed on a different machine; this session picks up
item #1 from the evening's "Deferred" list — wiring
`TerminalTabs.tsx` into `App.tsx`.

The user explicitly asked to operate against the **testing repo only**
this session; nothing was pushed to `LxveAce/claude-code-studio`
(public release).

---

## Cross-machine pickup work (before code changes)

User started on a fresh machine. Setup actions:

- Confirmed `master` (origin/main repo) had one chore commit today:
  `49b8fd9 chore(repo): move dev artifacts to testing-only` — stripped
  journal/, security-reviews/, session logs, and one-off dev docs from
  the public repo. Testing retains the full archive.
- Created local branch `testing-master` tracking
  `remotes/testing/master`. All work happens here, push targets
  `testing` only.
- Refreshed `node_modules` against the v3.1.0 lockfile (`npm install` —
  124 added, 6 removed). Postinstall ran `patch-node-pty.js` cleanly.
- Cleaned stale build artifacts: `.vite/`, `out/`, `dist/`
  (`dist/win-unpacked/` was held open by 3 running CCS instances —
  stopped them first).
- Old installers in `Desktop\claude-code-studio-installers\` pruned
  per user choice: kept `Claude-Code-Studio-3.0.0-Windows.exe` (last
  shipped public stable) + new `Claude-Code-Studio-3.1.0-Windows.exe`;
  deleted 2.0.0 + 3.0.0-beta.1/2/3 (~270 MB freed).
- Pulled v3.1.0 Windows installer from the **draft** release on the
  testing repo. The Release CI created the release as `--draft` (per
  `.github/workflows/release.yml:123`) so it isn't visible via anonymous
  API. Authenticated `gh` and downloaded with
  `gh release download v3.1.0 --pattern "*Windows.exe"`. Release left
  draft (matches user's "testing only" stance).

---

## What got built this session

### TerminalTabs wired into App.tsx

LMM-walked the change before touching code (RAW → NODES → REFLECT →
SYNTHESIZE) — full analysis is in the new
`journal/src/renderer/components/terminal/TerminalTabs.tsx.lmm.md` and
the updated `journal/src/renderer/App.tsx.lmm.md`.

Specific file changes:

| File | Change |
|---|---|
| `src/shared/types.ts` | Dropped `SplitNode`, `SplitPaneNode`, `SplitContainerNode`. Added `PersistedTab`. `SessionState` now has `tabs: PersistedTab[]` + `activeTabId: string \| null` instead of `layout: SplitNode`. |
| `src/main/session-service.ts` | `STORE_VERSION = 2`. New `sanitizeTabs()` (max 32, id regex, dedupe, drops `profile !== 'claude'`). v1→v2 migration via `extractFirstPaneId()` — preserves the first pane's id so an alive PTY reattaches across hot-reload. Helper text references updated. |
| `src/renderer/App.tsx` | `[layout, activePaneId]` state replaced with `[tabs, activeTabId]`; `activePaneId` derived (`tabs.find(t => t.id === activeTabId)?.paneId`). New handlers: `handleNewClaudeTab`, `handleCloseActiveTab`, `handleFocusTab`, `handleResetTabs`. Old `handleSplit`/`handleClosePane`/`handleFocusNext`/`handleResetLayout`/`firstPaneId` removed. Catalog fetched via `models.list()` on hydrate (for the `+` profile picker). |
| `src/renderer/components/palette/CommandPalette.tsx` | Props renamed: `onSplit`/`onClosePane`/`onFocusNext`/`onFocusPrev`/`onResetLayout` → `onNewClaudeTab`/`onCloseTab`/`onFocusNextTab`/`onFocusPrevTab`/`onResetTabs`. Action labels migrated from "Split horizontal/vertical" / "Close pane" / "Focus next pane" / etc. → "New Claude tab" / "Close tab" / "Next tab" / "Previous tab" / "Reset tabs". `Panes` group renamed `Tabs`. |
| `src/renderer/components/terminal/TerminalTabs.tsx` | Race fix in scaffold (was Critical): `onTabsChange` prop changed to `React.Dispatch<React.SetStateAction<TerminalTab[]>>`; `addClaudeTab` / `addModelTab` / `closeTab` now use updater functions to survive concurrent gestures. See `SECURITY_REVIEW_TERMINAL_TABS.md` C-1. |
| `src/renderer/components/terminal/SplitLayout.tsx` | **Deleted.** |
| `src/main/pty-registry.ts` | Doc comment updated to reference TerminalTabs (was {@link SplitLayout}). |
| `journal/INDEX.md` | TerminalTabs entry added; counter 40 → 41. |
| `journal/src/renderer/components/terminal/TerminalTabs.tsx.lmm.md` | **New** — full LMM (RAW/NODES/REFLECT/SYNTHESIZE). |
| `journal/src/renderer/App.tsx.lmm.md` | Replaced — previous entry was from the 195-LOC era. Current entry reflects the ~680-LOC integration-hub reality. |
| `docs/security-reviews/SECURITY_REVIEW_TERMINAL_TABS.md` | **New** — red-team review. C-1 fixed in-commit; H-1 / M-1 / M-2 / M-3 / L-1 / L-2 deferred with rationale. |
| `docs/STATUS.md` | Item #1 moved from Deferred → What's live. Items #2, #3 renumbered. Pointers list updated. |

### Verification posture

- `npx tsc --noEmit` — clean (0 errors after one type fix on
  `focusedPid` narrowing).
- `npx vite build --config vite.renderer.config.ts` — clean (901
  modules, ~480 ms). Pre-existing chunk-size-warning is not a
  regression.
- No automated tests added — matches the repo's manual-QA posture for
  renderer work. Smoke list is in the security review.

### Red-team summary (full detail in SECURITY_REVIEW_TERMINAL_TABS.md)

- **Critical 1** — concurrent-mutation race in TerminalTabs scaffold.
  **Fixed in-commit.**
- **High 1** — `EmbeddedTerminal` lacks `registerSender` plumbing;
  snippet/palette text to model tabs is silently dropped. Deferred —
  bundled with the next Commands-tab-mirroring work (item #2 in
  STATUS Deferred).
- **Medium 1** — no renderer-side tab count cap. Deferred.
- **Medium 2** — `closeTab` focus-fallback still reads from closure
  `tabs`. Cosmetic only.
- **Medium 3** — CLI onboarding sends `/login` to active tab
  regardless of profile. Deferred.
- **Low 1** — `PlaceholderPanel.info` dead-code dict.
- **Low 2** — `HotkeyAction` enum lacks tab actions.

---

## Handoff checklist (for next session)

1. `git fetch testing && git checkout testing-master` (or `git pull` if
   the feature branch was already merged).
2. `cat docs/STATUS.md` for the current state — items #1 and #2 in
   Deferred are the next likely picks (Claude chat-mode profile;
   Commands-tab mirroring the active model).
3. Manual smoke list from `docs/security-reviews/SECURITY_REVIEW_TERMINAL_TABS.md`
   — particularly step 4 (open Claude tab during a model launch) to
   verify the C-1 fix in a real run.
4. If you pick up item #2 (Commands tab mirrors active model), it's a
   good moment to also fix H-1 (give `EmbeddedTerminal` a
   `registerSender` so snippet injection works on model tabs).
