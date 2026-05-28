# Journal Index — LMM Analyses

This directory holds one **LMM** (Lincoln Manifold Method) analysis per
source file: a structured think-through of each file recorded as
`<source-path>.lmm.md`. The folder layout **mirrors the source tree**, so
the analysis for `src/foo/bar.ts` lives at `journal/src/foo/bar.ts.lmm.md`.

---

## How to use this journal (for future LMM sessions)

**What an LMM entry is.** Each `*.lmm.md` walks one file through four
phases: **RAW** (unfiltered first-read observations + open questions) →
**NODES** (discrete points/tensions, line-referenced) → **REFLECT**
(core insight, resolved tensions, hidden assumptions) → **SYNTHESIZE**
(the distilled takeaway / what to do). Treat it as design reasoning about
the file, not a changelog.

**Where to put a new entry.** Mirror the source path under `journal/`:
- `src/main/foo.ts`            → `journal/src/main/foo.ts.lmm.md`
- `src/renderer/components/x/Y.tsx` → `journal/src/renderer/components/x/Y.tsx.lmm.md`
- Root-level build/config/docs (no `src/` dir of their own — e.g.
  `forge.config.ts`, `package.json`, `vite.*.config.ts`, `tsconfig.json`,
  `scripts/patch-node-pty.js`, `HANDOFF.md`, `src/declarations.d.ts`)
  → `journal/config/<file>.lmm.md`

**Naming.** Keep the source file's real name and extension, then append
`.lmm.md` (e.g. `BranchList.tsx.lmm.md`). Do **not** flatten the path into
underscores — that was the old convention; this reorg un-flattened it.

**Header style.** Start each file with `# LMM — <source/path>` and use
`## RAW` / `## NODES` / `## REFLECT` / `## SYNTHESIZE` headings. (Some
older entries use `# LMM:` and `## Phase 1: RAW` — both are fine to read;
prefer the simpler form for new entries.)

**After adding/moving entries, update this INDEX** (the catalog below).
The in-app LMM panel (Phase 4.5) and the compact-controller can also
record cycles; those are separate from this on-disk journal.

---

## Catalog

### `config/` — build, tooling & root docs (9)
- `forge.config.ts.lmm.md` — electron-forge packaging/makers/plugins
- `package.json.lmm.md` — deps, scripts, engines
- `tsconfig.json.lmm.md` — TypeScript config
- `vite.main.config.ts.lmm.md` — Vite build for the main process
- `vite.preload.config.ts.lmm.md` — Vite build for the preload
- `vite.renderer.config.ts.lmm.md` — Vite build for the renderer
- `patch-node-pty.js.lmm.md` — `scripts/patch-node-pty.js` postinstall patch
- `HANDOFF.md.lmm.md` — the development handoff doc itself
- `declarations.d.ts.lmm.md` — `src/declarations.d.ts` ambient types

### `src/main/` — main process (6)
- `index.ts.lmm.md` — app bootstrap, BrowserWindow, IPC wiring
- `pty-manager.ts.lmm.md` — Phase 1 terminal backend (node-pty + fallback)
- `resource-monitor.ts.lmm.md` — Phase 2 CPU/RAM/GPU polling
- `compact-controller.ts.lmm.md` — Phase 3 compact-controller state/hooks
- `git-service.ts.lmm.md` — Phase 4 local git ops
- `github-service.ts.lmm.md` — Phase 4 Octokit wrapper

### `src/preload/` (1)
- `preload.ts.lmm.md` — contextBridge API surface

### `src/shared/` (2)
- `ipc-channels.ts.lmm.md` — IPC channel constants
- `types.ts.lmm.md` — shared TypeScript types

### `src/renderer/` — renderer root (4)
- `App.tsx.lmm.md` — root component, panel routing, terminal bridge
- `main.tsx.lmm.md` — React entry point
- `index.html.lmm.md` — HTML shell + CSP
- `styles/globals.css.lmm.md` — theme tokens, keyframes/animations

### `src/renderer/components/auth/` (2)
- `ApiKeyModal.tsx.lmm.md` — universal pre-launch / interceptor API-key dialog
- `ProviderKeysList.tsx.lmm.md` — Settings view of stored provider keys + AuthSource tags

### `src/renderer/components/chat-skin/` (1)
- `ChatSkinOverlay.tsx.lmm.md` — markdown-over-sanitized-bytes chat overlay on top of xterm

### `src/renderer/components/commands/` (3)
- `CommandsPanel.tsx.lmm.md` — 3-tab sidebar; family-driven post-refactor
- `QuickCommands.tsx.lmm.md` — Quick Actions sub-panel; now data-driven
- `command-families.ts.lmm.md` — per-CLI command tables + `deriveCommandFamily` helper

### `src/renderer/components/compact/` (1)
- `CompactPanel.tsx.lmm.md` — Phase 3 UI

### `src/renderer/components/github/` — Phase 4 GitHub UI (8)
- `GitHubPanel.tsx.lmm.md` — panel shell
- `ConnectGitHub.tsx.lmm.md` — PAT connect flow
- `RepoHeader.tsx.lmm.md`
- `WorkingDirCard.tsx.lmm.md`
- `CommitList.tsx.lmm.md`
- `BranchList.tsx.lmm.md`
- `PRList.tsx.lmm.md`
- `IssueList.tsx.lmm.md`

### `src/renderer/components/layout/` — app chrome (3)
- `TitleBar.tsx.lmm.md` — frameless title bar + window controls
- `Sidebar.tsx.lmm.md` — panel switcher
- `StatusBar.tsx.lmm.md` — PID / status footer

### `src/renderer/components/models/` (2)
- `EmbeddedTerminal.tsx.lmm.md` — attaches to model PTYs; registerSender wires text-injection (H-1 fix)
- `ProviderSetupModal.tsx.lmm.md` — instructions modal for missing provider CLIs

### `src/renderer/components/resources/` — Phase 2 UI (2)
- `ResourcePanel.tsx.lmm.md`
- `GaugeBar.tsx.lmm.md` — dual-fill gauge

### `src/renderer/components/settings/` (2)
- `SettingsPanel.tsx.lmm.md`
- `ThemeEditor.tsx.lmm.md` — custom-theme creator

### `src/renderer/components/terminal/` (2)
- `TerminalPanel.tsx.lmm.md` — xterm host + fit/resize handling
- `TerminalTabs.tsx.lmm.md` — Windows-Terminal-style tab strip; replaces SplitLayout in App.tsx

---

*Total: 47 LMM analyses. Keep this catalog in sync when entries are
added, moved, or removed.*
