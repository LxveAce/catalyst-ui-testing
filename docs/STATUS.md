# Claude Code Studio — Testing Repo STATUS

> **Version:** v3.1.0
> **Last updated:** 2026-05-27 (multi-session evening push — GPU + chat-skin v2 + auto-detect + BitNet + v3.1.0 bump)
> **Branch this describes:** `master` (testing repo only — `LxveAce/claude-code-studio-testing`)
> **Latest session log:** [`SESSION_LOG_2026-05-27_rnd-kickoff.md`](./SESSION_LOG_2026-05-27_rnd-kickoff.md)
> **Latest verification report:** [`VERIFICATION_2026-05-27.md`](./VERIFICATION_2026-05-27.md)

This is the always-current pickup doc. A fresh `git clone` + reading this file should
tell the next Claude session (on any machine) exactly where the work stands.

---

## TL;DR for the next session

Pick this up by:

1. **Read this whole file** — every recent change is summarized below.
2. **Read the "Deferred — pick up here" section** — three items the user asked for
   that I scoped + scaffolded but did not ship in this session: TerminalTabs wiring
   into App.tsx, Claude chat-mode (`--output-format=stream-json`) for the chat skin,
   and Commands tab mirroring the active model.
3. **Built Windows installer**: see the latest GitHub Release on
   `LxveAce/claude-code-studio-testing` (if I made it to the build-and-upload step
   before this session ended — search "Releases" tab).
4. **Open issues**: see issue tracker on the testing repo.

---

## Where we are

The official release (`LxveAce/claude-code-studio` master) shipped **v3.0.0** on
2026-05-26. The testing repo is the active dev branch — every R&D feature lands
here first.

**testing/master is currently at PR #17 merged.** Sequence of work this evening:

| PR | Topic | Status |
|---|---|---|
| #13 | Local-AI PATH resolver (the "GPU ignored" bug — root cause was PATH, then…) | merged |
| #14 | Chat-skin overlay v1 (now superseded by v2 in #17) | merged |
| #15 | **GPU routing fix** + Liquid LFM catalog + Jetson Thor tier | merged |
| #16 | Chat-skin redesign v1 + multi-model tab strip in Models panel | merged |
| #17 | **Chat-skin v2** + per-pane popout skin + + tab picker + auth auto-detect + BitNet + TerminalTabs scaffolding | merged |

---

## What's live (deep dive)

### GPU routing (PR #15) — fixes "my dedicated GPU is ignored"

Root cause: Ollama reads GPU env vars (`CUDA_VISIBLE_DEVICES`, `HIP_VISIBLE_DEVICES`,
`OLLAMA_VULKAN`, etc.) at `ollama serve` startup — NOT per-`ollama run`. Our code
was injecting env into the wrong process. Fix in `src/main/gpu-prefs.ts` +
`OllamaService.daemonStart()` now passes the right env via `buildDaemonEnv()`.

UI: Models panel's hardware banner has a "GPU routing: Auto / Force GPU / Force CPU"
dropdown plus a per-GPU picker if multiple dedicated GPUs are detected. Apply button
restarts the daemon with the new env. New types: `GpuVendor`, `GpuBackend`, `GpuInfo`,
`GpuMode`, `GpuPrefs` in `src/shared/types.ts`.

### Chat skin v2 (PR #17) — fixes "looks horrible" + "CLI gets translated weirdly"

Two passes addressing user feedback. Final state:

- **Layout**: persona header at top (avatar + model name + subtitle); 720px-centered
  column; soft rounded bubbles for BOTH roles (no per-message avatars); pill composer
  with circular gradient send button.
- **Markdown rendering** via `react-markdown` + `remark-gfm` + `react-syntax-highlighter`
  (Prism, oneDark). Code blocks have a header bar with language + Copy button.
- **Aggressive sanitizer** for incoming bytes:
  - Detects screen-clear sequences (`\x1b[2J`, `\x1bc`, `\x1b[?1049[hl]`, `\x1b[H`) in
    the RAW bytes before stripping. On detection: starts a NEW assistant message
    instead of appending — stops the TUI-repaint duplication (the "Accessing workspace
    Quick safety check…" appearing twice in the user's screenshot).
  - Strips CSI/OSC/DCS, bare ESC/BEL/NUL, CR-overwrite lines, collapses 3+ newlines.
- **`InteractivePromptBanner`** above any assistant bubble whose content matches
  selection-menu patterns ("Enter to confirm", "Esc to cancel", "1. Yes 2. No",
  "Select an option", "❯ <number>"). Tells the user to switch to Terminal view to
  respond.
- **Per-pane skin toggle** persisted via `localStorage` (`chat-skin:<paneId>`). Works
  on TerminalPanel AND EmbeddedTerminal (so model panes + popout windows all support
  the chat skin and remember per-pane choice across reloads).
- **Streaming cursor** (▍ blinking at end of latest assistant message while a chunk
  arrived within 800ms).

### Auth auto-detect (PR #17) — fixes "Claude was authed but the app doesn't know"

`ProviderAuthService.list()` now returns each entry with an `AuthSource` field:
- `stored` — safeStorage entry exists (canonical).
- `env` — env var is set in `process.env` (inherited from shell; spawned PTYs get it
  too, no need to copy).
- `cli-oauth` — Anthropic only: `~/.claude.json` or `~/.claude/oauth_*.json` exists
  with non-trivial content (looks for `oauthAccount` / `access_token` /
  `refresh_token`). Token is not exportable, we just acknowledge it.
- `none` — nothing detected.

ProviderKeysList shows colored tags next to each provider:
- 🟢 "CLI OAuth" green — Anthropic via `claude /login`.
- 🔵 "env var" blue.
- 🟣 "saved" purple.

Button label says "Override" instead of "Set" when an external source is detected.

### Multi-model tab strip in Models panel (PR #16 + #17)

Running models render as a horizontal tab bar (with status dot + name + ↗ popout +
× close per tab). New "+ New" tab at the end opens `TabModelPicker` — a searchable
catalog dropdown grouped by API / Local. Picking a model fires the existing launch
flow (license + CLI-detect + API-key gates).

The terminal popout (`models.popout(paneId, label)`) opens a new BrowserWindow
that ALSO shows the chat-skin toggle and respects the per-paneId preference.

### Catalog additions

- **Liquid AI LFM2.5** — 2 entries (`ollama.lfm2.5-350m`, `ollama.lfm2.5-1.2b-instruct`)
  via `hf.co/LiquidAI/...:Q4_K_M`. LFM1.0 custom license flagged. Edge tier.
- **Jetson AGX Thor** — new `'jetson-thor'` hardware tier (workstation-equivalent
  compute, 128 GB unified memory). 28 existing workstation-class catalog entries
  tagged with it.
- **BitNet b1.58 2B (Microsoft)** — added in PR #17. Uses `command: 'bitnet'` (the
  bitnet.cpp runner — not Ollama). Flagged so users see the install requirement
  before launch.

### Audit fix-pass

From the deep code audit (3 parallel Explore agents on main services + renderer +
build). Real bugs fixed:
- `cli-flags.ts` + `compact-controller.ts` config-write — both were direct
  `writeFileSync` (non-atomic). Now use the standard tmp+rename pattern.
- Sidebar buttons had no `aria-label` / `data-panel` — added both. (a11y win +
  enabled the CDP-driven runtime verifier.)

### Runtime verification harness

`scripts/runtime-verify.mjs` — spawns Electron with `--remote-debugging-port=9222`,
polls for React mount, enumerates `[data-panel]` sidebar buttons, clicks each one,
captures any console/exception events, writes per-tab pass/fail to
`runtime-verify-summary.md`. Latest run: **12/12 tabs pass with zero console errors**.

To run again: `node scripts/runtime-verify.mjs` (will spawn Electron, ~3 min total).

---

## Deferred — pick up here next session

Three things the user asked for that I scoped + (in one case) wrote the code for,
but did NOT wire into the live app this session:

### 1. Wire `TerminalTabs.tsx` into `App.tsx`

**Status**: the file exists at `src/renderer/components/terminal/TerminalTabs.tsx`
with a full Windows-Terminal-style implementation. NOT YET used by App.tsx — App
still renders `SplitLayout`.

Why deferred: wiring it means migrating the session-state shape from
`layout: SplitNode` to `tabs: TerminalTab[]` (+ `activeTabId`). Shipping that
half-done would regress users who relied on the existing split-pane layout. Needs:

- App.tsx state: drop `layout` + `activePaneId` (or keep activePaneId derived from
  active tab), add `tabs` + `activeTabId`.
- Replace `<SplitLayout … />` with `<TerminalTabs … />`.
- Session persistence: write `{ tabs, activeTabId }` instead of `{ layout, activePanel }`.
  Backward-compat: detect old shape on read and migrate to a single Claude tab.
- The existing palette + snippets + hotkeys still use `activePaneId` — keep that
  derived from the active tab so they continue to work.

The TerminalTabs file itself has Claude profile + model-profile launch logic,
profile picker dropdown, close + popout per tab.

### 2. Claude "chat-mode" profile

**Status**: scoped only — no code yet.

User insight: when the chat skin is active, Claude CLI's interactive TUI gets
translated into garbled chat text. The cleanest fix is to run Claude in a
non-interactive structured-output mode when the chat skin is active.

Implementation sketch:
- Claude CLI supports `--output-format=stream-json --input-format=stream-json` — gives
  structured JSON events instead of TUI. Bidirectional.
- Add a new profile "Claude (Chat)" to the catalog that uses these flags. Its PTY
  emits JSON; we parse it and render proper messages in the chat skin.
- Add a JSON-stream parser in `src/renderer/components/chat-skin/` (or wherever).
- The chat-skin overlay detects the profile and routes to the JSON renderer
  instead of the markdown-over-sanitized-bytes path.
- User picks "Claude" (TUI for terminal) or "Claude (Chat)" (JSON for chat skin)
  at tab creation. Different tabs can use different modes.

This is a substantial refactor. Schedule it together with item #1 (TerminalTabs
wiring) since both touch the tab/profile model.

### 3. Commands tab mirrors active model

**Status**: scoped only — no code yet.

User request: the Commands sidebar panel currently shows static / Claude-only
commands. Make it derive from the currently active terminal tab's profile.

Implementation sketch:
- CommandsPanel reads `activePaneId` / activeTab + the tab's profile.
- For Claude: existing slash-command list (already wired).
- For other CLIs: a per-CLI commands map (claude / gemini / aider / aider+openrouter /
  ollama generic). Manually curated.
- Optionally: parse `<cli> --help` once per session and surface common flags.

Implementation depends on item #1 (need to know which tab is active in a tab-based
world).

---

## What still works (regression check from earlier sessions)

- All 12 sidebar tabs render without console errors (latest CDP verifier run).
- TypeScript compile clean.
- Vite production build clean.
- Local Ollama models spawn correctly (PATH resolver from PR #13 + GPU env from PR #15).
- API key UI: pre-launch modal, PTY interceptor, env injection at PTY spawn — all wired.
- 3 providers (Gemini / Aider / OpenRouter via Aider) in catalog.
- Cat 7 Ollama daemon autostart if local models registered.
- Cat 8 installer wizard + Ollama opt-in + BMP chrome.
- Themes (13 built-ins + custom editor) + per-window state persistence.

---

## Known issues / gotchas (carry forward)

- **node-pty patches**: postinstall requires Windows C++ Build Tools (VS 2022 +
  Windows SDK).
- **NSIS Dev Mode**: `npm run dist` needs Windows Developer Mode enabled OR running
  as Administrator (for symlinks during electron-builder packaging).
- **Cat 7 daemon poll**: 15s window. If Ollama is slow on the user's box, increase
  the `TIMEOUT_MS` in `OllamaService.daemonStart`.
- **Claude TUI in chat skin**: even with the v2 sanitizer, some selection prompts
  won't render perfectly — the proper fix is item #2 above (chat-mode profile).
- **TerminalTabs scaffold not wired**: see item #1 above.

---

## Local setup on a new machine

```powershell
# 1. Clone (testing repo)
git clone https://github.com/LxveAce/claude-code-studio-testing.git
cd claude-code-studio-testing

# 2. Install deps (will rebuild node-pty for Electron — needs VS Build Tools)
npm install

# 3. Apply node-pty patches (runs automatically as postinstall, but in case)
node scripts/patch-node-pty.js

# 4. Launch the app in dev mode
npm start

# 5. (Optional) Build a Windows installer — REQUIRES Dev Mode
#    Tried building this from the agent's shell on 2026-05-27 — failed at
#    the NSIS step with "Cannot create symbolic link : A required privilege
#    is not held by the client." winCodeSign unpacks symlinks to
#    %LOCALAPPDATA%\electron-builder\Cache\winCodeSign\…\darwin\…\libcrypto.dylib
#    which needs SeCreateSymbolicLinkPrivilege.
#
#    Two ways to fix on Windows:
#      a) Settings → Privacy & Security → For developers → Developer Mode ON.
#      b) Run the build shell as Administrator (right-click → Run as administrator).
#    Then:
npm run dist
# Output: dist/Claude-Code-Studio-3.1.0-Windows.exe

# 6. (Optional) Run the CDP-driven tab-by-tab verifier
node scripts/runtime-verify.mjs
# Output: runtime-verify-summary.md (markdown pass/fail per sidebar tab)
```

If `npm install` fails on node-pty rebuild: install Visual Studio 2022 with the
"Desktop development with C++" workload + Windows 10/11 SDK, then re-run.

---

## Repo split

- **`claude-code-studio`** (public release) — slim. End-user-facing only.
- **`claude-code-studio-testing`** (this repo) — full dev archive + every R&D
  feature in flight.

Promotion path: testing/master → cherry-pick / PR to public repo when ready
to ship a public update.

---

## Pointers

- **Plan file (Claude-local, not in repo):**
  `~/.claude/plans/im-going-to-enable-lovely-cook.md`.
- **Per-file LMM journals:** `journal/` mirrors `src/` paths.
- **Multi-provider design notes:** `docs/MULTI_PROVIDER_BRAINSTORM.md`.
- **Backlog:** `docs/BACKLOG.md`.
- **R&D kickoff session log:** `docs/SESSION_LOG_2026-05-27_rnd-kickoff.md`.
- **Verification report:** `docs/VERIFICATION_2026-05-27.md`.
- **Runtime verifier:** `scripts/runtime-verify.mjs` (writes
  `runtime-verify-summary.md` to repo root).
- **Audit + fix-pass detail:** PR #13 description on the testing repo.
