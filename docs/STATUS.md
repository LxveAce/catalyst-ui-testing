# Catalyst UI — Testing Repo STATUS

> 👉 **NEWEST PICKUP DOC: [`HANDOFF_2026-06-03.md`](./HANDOFF_2026-06-03.md)** —
> read that first. It covers everything below + the terminal-profiles and
> Catalyst Brain work shipped after v4.0.3.
>
> **Product:** Catalyst UI *(formerly Claude Code Studio — renamed at v4.0.0)*
> **Version:** v4.0.3 (+ unreleased terminal-profiles & Catalyst Brain on master)
> **Last updated:** 2026-06-03
> **Branch this describes:** `master` (testing repo: `LxveAce/catalyst-ui-testing`)
> **Latest cross-machine handoff:** [`journal/V4_0_3_TRANSFER_TESTING.md`](../journal/V4_0_3_TRANSFER_TESTING.md)
> **Full per-release history:** [`CHANGELOG.md`](../CHANGELOG.md)

This is the always-current pickup doc. A fresh `git clone` + reading this file
should tell the next session (on any machine) exactly where the work stands.

---

## TL;DR for the next session

1. **Read this file**, then `journal/V4_0_3_TRANSFER_TESTING.md` (the latest
   ship's full context + test plan) and `CHANGELOG.md`.
2. The app was **renamed Claude Code Studio → Catalyst UI** at v4.0.0. The
   userData dir name and Windows `appId` were deliberately preserved so v3.x
   installs upgrade in place and keep all settings. See
   [`MIGRATING_FROM_CCS.md`](./MIGRATING_FROM_CCS.md).
3. We now run **two repos** (see "Repo split" below): develop in
   `catalyst-ui-testing`, promote to `catalyst-ui`.
4. Open follow-ups for v4.1 are in "What's next" below + `docs/BACKLOG.md`.

---

## Repo split / workflow

- **`catalyst-ui-testing`** (https://github.com/LxveAce/catalyst-ui-testing) —
  this repo. Full dev archive + every R&D feature in flight. **All work lands
  here first.**
- **`catalyst-ui`** (https://github.com/LxveAce/catalyst-ui) — slim public
  release repo, end-user-facing. Promote testing → public when shipping
  (squash-merged PRs, so its commit history diverges from testing's granular
  history; the code + tags line up per release).
- The old `claude-code-studio[-testing]` repos were renamed; GitHub keeps
  permanent redirects, so old URLs and the auto-updater config baked into
  v3.2.1 binaries still resolve.

Promotion at v4.0.3 used a single-overlay commit (code + CHANGELOG +
package.json only, no docs/journal) — see
`journal/logs/v403-promotion-overlay.patch`.

---

## Where we are

v4.0.3 is the current shipped release on **both** repos (public master at the
v4.0.3 release commit; testing master one or two docs commits ahead). It was a
**strict bug-fix** release over v4.0.2 — four issues the user surfaced via
screenshots of the v4.0.2 dev build:

1. `Cannot resize a pty that has already exited` modal crash — `PtyManager`
   now nulls its handle on exit + defensive try/catch in `PtyManager.resize`
   and `PtyRegistry.resize`.
2. Claude (Chat) yellow stream-json diagnostic was invisible — `ModelsPanel`
   now passes `profile` to `EmbeddedTerminal`.
3. Commands panel "Stream-JSON mode" empty-state had no escape — added a
   "+ Switch to a plain Claude tab" CTA.
4. Curated-research fast-exit hint — fixed as a side effect of #2.

The big v4.0.0 release was the **Catalyst UI rebrand + Hugging Face Hub
integration**; v4.0.1/4.0.2 were HF hotfixes + a deep-iteration pass.

---

## What's live (the v4.0.x feature surface)

### Hugging Face Hub panel (headline v4.0 feature)
Sidebar panel with **Browse / Cached / Research** sub-tabs.
- **Browse** — live Hub search (`@huggingface/hub` in
  `src/main/huggingface-service.ts`); GGUF detection via the authoritative
  `m.gguf` signal; hardware-aware **FitBadge** per quant vs detected VRAM/RAM;
  ★ recommended-quant; gguf metadata badges (arch / context / size); sort +
  license-chip filters; clickable tag/author chips; in-app details panel +
  explicit "Web ↗".
- **Cached** — local HF cache listing, per-repo size, Open ↗ / Copy path /
  Remove.
- **Research** — disclaimer-gated opt-in tab with 18 curated uncensored /
  abliterated GGUF catalogs + per-launch audit log
  (`<userData>/huggingface-research-audit.jsonl`).
- **Import & launch** — synthesizes an `hf.<repo>.<quant>` (or
  `hf-research.*`) catalog entry and launches via the shared `MODELS_LAUNCH`
  pipeline. **Direct GGUF download** (`hf:download`) with progress / cancel /
  resume into Catalyst's own cache.
- Tokens never cross IPC to the renderer.

### TerminalTabs (since v3.2.0)
Windows-Terminal-style tab strip (replaced the old split-pane layout).
- `+` opens the **profile picker** (also `Ctrl+Shift+T`). Profiles: **Claude**
  (bundled default) + every catalog model (Ollama / Aider / Gemini / BitNet) +
  **Claude (Chat)**.
- Per-tab popout (`↗`) to a separate BrowserWindow, status dots, `MAX_TABS=32`,
  session schema v2 (`tabs[] + activeTabId`, migrated from v1 split tree).

### Claude (Chat) profile
`api.anthropic.claude-chat` runs `claude --print --input-format=stream-json
--output-format=stream-json --verbose`, rendered as structured chat (text /
tool_use / tool_result / thinking blocks) via the ✦ chat-skin overlay. Picker
badges it "CLI flags?" when the local CLI lacks stream-json (probe via
`claude --help`). Stop button sends SIGINT mid-stream.

### Other v4.0.x additions
- **Accessibility** Settings section — 10 persisted toggles (contrast, font
  scale, reduce motion, color-blind palettes, etc.) at
  `<userData>/accessibility.json`, applied via `data-*` on `<html>`.
- **Resizable right panel** — 420px default, drag handle (280–800), persisted
  in localStorage, double-click to reset.
- **Commands sidebar** mirrors the active tab's CLI family.

### Carried over from v3.x
Multi-model catalog + Ollama lifecycle + hardware-tier detect + GPU routing,
file directory navigator, per-bucket resource monitor (Claude / models /
Ollama), `--dangerously-skip-permissions` **global** toggle (Settings → Claude
CLI; never affects model PTYs), Danger Zone (reset user data / uninstall),
GitHub panel, LMM panel, auth + settings sync, vault sync, command palette,
snippets, notifications, auto-updater, tray, rebindable hotkeys, cost tracker,
theming (13 built-ins + custom editor).

---

## Launch-path map (for terminal / PTY work)

- **Claude tabs:** `TerminalPanel` → `terminal.spawn(paneId, cwd)` (IPC
  `TERMINAL_SPAWN`, `src/main/index.ts`) → `PtyRegistry.spawn` →
  `PtyManager.spawn`. With NO `opts.command`, `PtyManager` reads
  `cli-flags.json` and prepends `--dangerously-skip-permissions` when the
  **global** toggle is on (`src/main/cli-flags.ts`, `src/main/pty-manager.ts`).
- **Model / HF tabs:** `models.launch(modelId)` (IPC `MODELS_LAUNCH`) →
  `launchModelDefinition()` spawns with `opts.command = model.command`,
  returns a `model:<id>-<ts>` paneId; rendered by `EmbeddedTerminal` (attaches
  to an existing paneId, never spawns). Model PTYs are NEVER given
  skip-permissions.

---

## What's next (v4.1 carry-over)

From the v4.0.3 transfer doc + `docs/BACKLOG.md`:

1. **PTY lifecycle smoke audit** — v4.0.2/4.0.3 both shipped without a harness
   exercising spawn → exit → resize (the gap that let the resize crash ship).
2. **`EmbeddedTerminal` `profile`-prop lint rule** — Bug 1 was a missing prop.
3. **Silence node-pty `AttachConsole failed` noise** from
   `conpty_console_list_agent.js`.
4. **Claude (Chat) capability gating** — picker currently only *badges*
   incompatible CLIs; consider blocking / auto-falling-back to plain `claude`.
5. Older backlog: per-provider API key UI, macOS code signing + notarization,
   model comparison view, embedding-RAG, per-model VRAM tracking.

---

## Audit state (pre-v4.0.3 ship)

Five CDP-driven audit harnesses, **132/132** assertions, zero renderer
exceptions:

| Audit | Score |
|---|---|
| `scripts/hf-cdp-test.mjs` | 32/32 |
| `scripts/hf-button-audit.mjs` | 32/32 |
| `scripts/lmm-audit.mjs` | 19/19 |
| `scripts/models-audit.mjs` | 21/21 |
| `scripts/multi-panel-audit.mjs` | 28/28 |

Run with dev mode up (`npm start -- -- --remote-debugging-port=9222`), then
`node scripts/<audit>.mjs`. **Known gap:** no PTY-lifecycle harness yet (see
v4.1 #1).

---

## Local setup on a new machine

```powershell
# 1. Clone the testing repo (dev happens here)
git clone https://github.com/LxveAce/catalyst-ui-testing.git
cd catalyst-ui-testing
# (optional) wire the public repo too
git remote add public https://github.com/LxveAce/catalyst-ui.git

# 2. Install deps (rebuilds node-pty for Electron — needs VS 2022 C++ Build Tools + Win SDK)
npm install
node scripts/patch-node-pty.js   # runs as postinstall, but in case

# 3. Dev
npm start
#    (with CDP for audits:)  npm start -- -- --remote-debugging-port=9222

# 4. Build a Windows installer — REQUIRES Windows Developer Mode ON
#    (Settings → Privacy & Security → For developers), or run elevated.
npm run dist
# Output: dist/Catalyst-UI-4.0.3-Windows.exe
```

Node 22 is required (`engines.node: ">=22.0.0 <24.0.0"`); Node 24 breaks
electron-builder packaging. Side-by-side Node 22 lives at
`C:\Users\extra\nodejs-22\` on the user's primary machine.

---

## Known issues / gotchas (carry forward)

- **node-pty `AttachConsole failed`** trace from
  `conpty_console_list_agent.js` in dev logs — harmless noise, scheduled for
  v4.1.
- **NSIS Dev Mode** required for local `npm run dist` (winCodeSign symlink
  extraction); CI runners handle it.
- **Claude (Chat) in chat skin** — selection prompts that need TUI interaction
  still hint the user to switch to Terminal view.
- **Two-repo drift** — public uses squash merges, so don't expect matching
  commit hashes across repos; match on tags/releases.

---

## Pointers

- **Cross-machine handoff (latest ship):** `journal/V4_0_3_TRANSFER_TESTING.md`
- **Rename migration:** `docs/MIGRATING_FROM_CCS.md`
- **Per-release history:** `CHANGELOG.md`; per-version notes in
  `docs/RELEASE_NOTES_v*.md`
- **Backlog / open ideas:** `docs/BACKLOG.md`
- **Bug triage + ship LMM walks:** `journal/V4_0_2_BUG_TRIAGE_2026-05-28.lmm.md`,
  `journal/V4_0_3_SHIP_2026-05-28.lmm.md`
- **Security reviews:** `docs/security-reviews/SECURITY_REVIEW_*.md`
- **Per-file LMM analyses:** `journal/` mirrors `src/` paths
- **Historical handoff (v1 → v3 phased plan):** `docs/HANDOFF.md`
