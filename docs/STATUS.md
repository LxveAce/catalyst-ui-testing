# Claude Code Studio — Testing Repo STATUS

> **Last updated:** 2026-05-27 (post-fix-pass + chat-skin shipped)
> **Branch this describes:** `master` (testing repo only — `LxveAce/claude-code-studio-testing`)
> **Latest session log:** [`SESSION_LOG_2026-05-27_rnd-kickoff.md`](./SESSION_LOG_2026-05-27_rnd-kickoff.md)
> **Latest verification report:** [`VERIFICATION_2026-05-27.md`](./VERIFICATION_2026-05-27.md)

This is the always-current pickup doc. A fresh `git clone` + reading this file should
tell the next Claude session (on any machine) exactly where the work stands.

---

## Where we are

The official release (`LxveAce/claude-code-studio` master) shipped **v3.0.0** on
2026-05-26 with the multi-model catalog, file tree, cross-platform uninstall flow,
and the v3.0.0 release docs.

**As of 2026-05-27 (after the fix-pass + chat skin):** the R&D push (Cat 1-9), a
**post-audit fix pass** (PR #13 — addresses the user-reported "local AI models don't
work at all" bug + multiple HIGH-severity issues from a thorough code-review audit),
and a **chat-skin overlay** (PR #14 — toggleable ChatGPT/Claude.ai-style chat UI on
terminal panes) are all shipped to testing/master. The official repo is slimmed of
dev-only artifacts (journal/, security-reviews/, session logs, INSTALLER_REDESIGN.md,
etc.); testing keeps the full
archive. R&D features land on testing first via feature branches → PR → merge, then
get promoted to the public repo when ready.

**Testing is now ahead of main by 8 merged feature PRs** (Cat 3 + Cat 4-8 + Cat 9
doc). Promotion to the public repo is the next step.

---

## What shipped this session

| Cat | PR / commit | Topic |
|---|---|---|
| 1 | force-push | Sync testing/master to `d0af93a` (release) |
| 2 | `49b8fd9` on **main** | Slim public repo of dev artifacts |
| 3 | `cd68563` | STATUS.md + SESSION_LOG + 6 GitHub issues |
| 4 | [#8](https://github.com/LxveAce/claude-code-studio-testing/pull/8) | Themes + theme editor + resizable windows + state persistence |
| 5 | [#9](https://github.com/LxveAce/claude-code-studio-testing/pull/9) | Universal API key UI + safeStorage + PTY interceptor |
| 6 | [#10](https://github.com/LxveAce/claude-code-studio-testing/pull/10) | Gemini / Aider / OpenRouter catalog + CLI detection + setup modal |
| 7 | [#11](https://github.com/LxveAce/claude-code-studio-testing/pull/11) | Ollama daemon autostart on app launch |
| 8 | [#12](https://github.com/LxveAce/claude-code-studio-testing/pull/12) | Installer wizard mode + BMP chrome + Ollama opt-in |
| 9 | folded into #10 | Multi-provider brainstorm doc |
| Fix-pass | [#13](https://github.com/LxveAce/claude-code-studio-testing/pull/13) | **Local AI PATH resolver** + provider-detect Windows .cmd + theme race + launch order + 5 more |
| Skin | [#14](https://github.com/LxveAce/claude-code-studio-testing/pull/14) | **Chat-skin overlay** — toggleable ChatGPT/Claude.ai-style UI on terminal panes |

Detail per category:

### Cat 4 — UI foundations
- 7 new built-in themes (Slate, Indigo, Crimson, Forest, Magenta, Midnight, Solarized
  → 13 total).
- Theme editor modal in Settings → Edit themes…, with color pickers + live preview +
  restore-on-dismiss. Custom themes persist to `<userData>/themes.json`.
- All BrowserWindows resizable; per-window geometry persisted to
  `<userData>/window-state.json`. Off-screen monitor recovery via
  `screen.getAllDisplays()`.

### Cat 5 — Multi-provider plumbing
- `provider-auth-service` — per-provider API key store, encrypted via Electron
  safeStorage. Raw keys never cross IPC.
- `ApiKeyModal` — single component for both pre-launch and PTY-interceptor flows.
  Dismiss = no nagging.
- `pty-key-interceptor` — per-pane regex watch for "Enter your X API key" prompts on
  attached panes only (Claude / Ollama exempt to avoid false positives).
- ModelsPanel pre-launch check + env-var injection at PtyRegistry spawn.
- ProviderKeysList in Settings shows all 4 known providers with set/replace/delete.

### Cat 6 + Cat 9 — Providers
- Catalog entries: `api.google.gemini-cli`, `api.aider.multi`, `api.openrouter.aider`.
- `provider-detect` — session-cached `<cli> --version` probes for `gemini` and `aider`.
- `ProviderSetupModal` — shown when CLI isn't installed; copyable install command +
  install-page link + retry.
- `docs/MULTI_PROVIDER_BRAINSTORM.md` — provider taxonomy, candidate statuses, the
  5-maps abstraction, open questions.

### Cat 7 — Ollama autostart
- `OllamaService.daemonStart/Stop/state` — detects externally-managed daemons (tray
  app, LaunchAgent, systemd) and doesn't duplicate them. Polls up to 15s for
  reachability.
- `maybeAutostartOllama` fires from `app.whenReady()` if any registered model has
  `provider === 'Ollama'` or `command === 'ollama'`. Fire-and-forget; never blocks
  startup.
- `before-quit` SIGTERMs Studio-spawned daemon; external daemons left alone.

### Cat 8 — Installer overhaul
- Wizard mode: `oneClick: false` + `allowToChangeInstallationDirectory: true`.
- BMP chrome: header (150×57), sidebar (164×314), uninstaller sidebar — vertical
  gradient from accent purple. Generated by `build/gen-installer-assets.mjs`.
- Opt-in Ollama install: MessageBox at start of `customInstall` asks the user;
  `/SD IDNO` defaults to skip on silent installs; install path soft-fails so Studio
  never gets blocked by Ollama errors.

### Fix-pass (PR #13) — addresses "local AIs don't work at all"

Root cause: `node-pty` on Windows does `CreateProcess` directly (no shell). Passing
bare `'ollama'` failed because the binary is `ollama.exe`. Claude worked because
`findClaudePath()` returned the bundled-runtime absolute path; everything else
needed resolution.

Fix: new `src/main/cli-resolver.ts` resolves bare commands via well-known install
dirs + `where.exe` / `which` lookup. `pty-manager.ts` runs it before spawn.
Diagnostic line printed to stderr on every spawn so future PATH issues are
easy to diagnose.

Same module + `shell: true` on Windows fixes `provider-detect.ts` finding `.cmd`
shims (npm-installed gemini-cli + Python aider). Detection timeout bumped from
4s → 8s for Aider's Python cold start.

Other fixes in the pass: theme hydration race between App.tsx and SettingsPanel
(now App is canonical), ModelsPanel launch order reordered (detect → key → license
→ spawn), ThemeEditor stale-callback cleanup, ApiKeyModal setState-after-unmount
guard, OpenRouter Aider entry's conflicting `--openai-api-base` removed.

### Chat-skin overlay (PR #14)

Toggleable ChatGPT/Claude.ai-style chat UI overlaid on the terminal pane. Same PTY
underneath; presentation skin only.

- Toggle off: small "✦ Chat" button top-right of xterm.
- Toggle on: chat-style header with "Terminal view" button + scrollable message
  area + bottom textarea (Enter sends, Shift+Enter newline).
- xterm stays mounted with `visibility: hidden` when skin is on — full
  scrollback preserved on toggle off.
- Per-pane preference persisted in localStorage.
- Echo suppression via `lastSentRef` so the assistant bubble doesn't start with
  the user's own input.
- Bounded memory (200 msgs × 100 KB each).

Limitations documented in the LMM journal: not a protocol-aware chat client; no
code highlighting; no tool-use UI. Future opt-in features tracked in the journal.

---

## What's queued for the next push

Nothing pre-defined for v3.1 yet. Open ideas surfaced during this push:

- **Promotion to public repo.** Each Cat 4-8 feature still lives in testing only.
  Cherry-pick or merge to `claude-code-studio` master when ready for an end-user
  release.
- **Real installer art.** The BMPs are functional placeholders (solid-color
  gradient). A designer can drop in actual artwork at the same dimensions
  (150×57 header, 164×314 sidebar) — no code change needed.
- **OAuth providers beyond Anthropic.** Today only the env-var-based providers
  (OpenAI / Gemini / OpenRouter) work via the universal key UI. Google's gemini-cli
  supports an OAuth flow; surfacing that would need a per-provider OAuth handler
  in main.
- **Custom providers** (user-defined, not in the seed catalog). `KNOWN_PROVIDERS`
  in `provider-auth-service.ts` is closed today. Opening would widen `ProviderId`
  to `string`.
- **Dynamic model lists.** Static catalog entries grow stale as providers ship
  new models. A `provider.listModels()` IPC hitting `/models` endpoints would
  keep the catalog fresh.
- **Modal resize.** Cat 4.2 made BrowserWindows resizable. React modals
  (AddModelModal, ThemeEditor, ApiKeyModal, ProviderSetupModal) remain fixed-size.
  Resizable modals = a UX enhancement, not load-bearing.
- **Real nsDialogs page for the Ollama opt-in.** Cat 8 used MessageBox for
  portability; a custom-painted page would look more cohesive with the wizard.
  Tracked in `journal/config/installer.nsh.lmm.md`.

---

## Known issues / gotchas

- **node-pty patches:** `scripts/patch-node-pty.js` runs in postinstall. Building
  on a fresh machine requires the **Windows C++ Build Tools** (Visual Studio 2022
  Desktop Development with C++ workload + Windows SDK). Without these,
  `npm install` will fail at the node-pty rebuild step.
- **Vite externals:** `vite.main.config.ts` externalizes `node-pty` and
  `systeminformation`. Builder picks them up from `package.json` deps. Do not
  inline them — the bundled main process emits bare `require()`s for them.
- **NSIS Dev Mode:** Building Windows installers (`npm run dist`) requires
  Windows Developer Mode enabled (for symlink support during electron-builder
  packaging) **or** running as Administrator.
- **Compact controller hooks:** Already wired in
  `~/.claude/settings.json` for the user. The hooks shape was buggy at the start
  of this session — fixed (removed duplicate malformed entries from Stop /
  PreCompact / PostCompact arrays).
- **Cat 7 daemon poll on Windows:** Ollama cold-start can hit 5-10s; we poll up
  to 15s for reachability. If a future Ollama version is slower, increase the
  TIMEOUT_MS in `ollama-service.ts daemonStart`.

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

# 5. Build a Windows installer (optional — requires Dev Mode)
npm run dist
```

If `npm install` fails on node-pty rebuild:
1. Install Visual Studio 2022 with "Desktop development with C++" workload.
2. Install Windows 10/11 SDK (any recent version).
3. Re-run `npm install`.

If pulling a model via Ollama fails: the Cat 7 autostart fires when local models
are registered. If you have local models but no daemon process is visible, check
that Ollama is installed (`ollama --version`) and re-launch Studio.

---

## Repo split (since 2026-05-27)

- **`claude-code-studio`** (public release) — slim. Contains only end-user
  facing files: source, CHANGELOG, README, LICENSE, install/release docs.
- **`claude-code-studio-testing`** (this repo) — full dev archive. Same source
  plus: `journal/` (LMM dev journals), `docs/security-reviews/` (21 phase
  audits), `docs/SESSION_LOG_*.md`, `docs/SHIPPING_CERTIFICATION.md`,
  `docs/FRESH_VM_TEST.md`, `docs/INSTALLER_REDESIGN.md`, plus all R&D
  features still in flight (currently all of Cat 4-8).

**Promotion path:** R&D feature → merged to `testing/master` → cherry-picked /
PRed to `claude-code-studio` master when ready to ship. Dev-only docs stay in
testing.

---

## Pointers

- **Plan for this R&D push:**
  `~/.claude/plans/im-going-to-enable-lovely-cook.md` (Claude
  local — not in repo).
- **Per-file LMM journals:** `journal/` (mirrors `src/` paths).
- **Multi-provider design notes:** `docs/MULTI_PROVIDER_BRAINSTORM.md`.
- **Backlog:** `docs/BACKLOG.md` — v3.0.1+ ideas, kept current as we work.
- **Historical handoff:** `docs/HANDOFF.md` — frozen at v1.0, kept for trail.
- **Last v3 release notes:** `docs/RELEASE_NOTES_v3.0.0.md`.
- **R&D kickoff session log:** `docs/SESSION_LOG_2026-05-27_rnd-kickoff.md`.
- **Verification report (this fix-pass + chat skin):** `docs/VERIFICATION_2026-05-27.md`.
