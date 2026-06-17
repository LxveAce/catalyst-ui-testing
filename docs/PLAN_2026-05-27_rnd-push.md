# Plan — Sync testing repo + R&D push (Claude Code Studio)

## Context

You just shipped **v3.0.0** to `LxveAce/claude-code-studio` (the official release repo).
The sibling `LxveAce/claude-code-studio-testing` repo is now stale — it sits at
`v3.0.0-beta.3` (one commit `48f4d81` past the merge base `7cd53ad`) while main has 4
release commits (cross-platform uninstall, release notes, CHANGELOG, BACKLOG cleanup).

We confirmed via file-level diffs:
- **Testing has zero unique content.** Main is a strict superset of testing.
- **Files only in main:** `CHANGELOG.md`, `docs/RELEASE_NOTES_v3.0.0.md`,
  `docs/SESSION_LOG_2026-05-26_v3.0.0_release.md`.
- **7 files modified differently** — in every case testing has the older content.

You want testing to become the **active dev branch** going forward:
1. Sync testing fully up to main (one-way overwrite).
2. Slim down main of dev-only artifacts so the public repo stays lean.
3. Pile a batch of R&D features onto testing for eventual promotion to main.
4. Track everything so a future Claude session on another computer can pick up.
5. Use LMM journals + the compact-controller during the work.

The plan organizes the work into **8 categories** so we don't conflate goals. Each
category lists files, specific changes, and verification. Execution proceeds
sequentially through Categories 1–2 (prereqs), then Categories 3–7 can each be a
feature branch off `testing/master`.

---

## Category 1 — Repo sync (PREREQ)

**Goal:** Make `testing/master` content-identical to `origin/master` (= `d0af93a`).

**Approach:** Hard-reset of remote `testing/master`. Cleanest because testing has
nothing unique to preserve. The lone commit `48f4d81` (pre-release merge) is
obsolete.

**Steps:**
1. From `C:\Users\mmrla\claude-code-studio`, checkout `master` locally and pull
   `origin/master` so working tree matches the release.
2. Push to testing: `git push testing origin/master:master --force-with-lease`.
3. Confirm: `gh api repos/LxveAce/claude-code-studio-testing/commits --jq '.[0].sha'`
   should equal `d0af93a…`.

**Verify:** `git diff origin/master..testing/master` returns empty.

---

## Category 2 — Slim down main (PREREQ before testing diverges)

**Goal:** Remove dev-only artifacts from the public release repo so end-users see a
lean repo. Testing keeps the full dev archive.

**To remove from `origin/master`:**
- `journal/` (entire LMM journal tree)
- `docs/security-reviews/` (21 phase-by-phase security audit files)
- `docs/SESSION_LOG_2026-05-24_v2.0_release.md`
- `docs/SESSION_LOG_2026-05-26_v3.0.0_release.md`
- `docs/SHIPPING_CERTIFICATION.md`
- `docs/FRESH_VM_TEST.md`
- `docs/INSTALLER_REDESIGN.md`

**Keep in main:** CHANGELOG, README, LICENSE, SECURITY, CONTRIBUTING,
`docs/MULTI_MODEL.md`, `docs/MIGRATING_FROM_V1.md`, `docs/RELEASE_NOTES_v*.md`,
`docs/HANDOFF.md`, `docs/BACKLOG.md`, all `docs/assets/`.

**Ordering:** Must happen AFTER Category 1. Once testing matches main (with all
the dev artifacts), THEN we strip main. Testing retains the archive.

**Single commit:**
```
chore(repo): move dev artifacts to testing-only

Strip journal/, security-reviews/, session logs, and one-off dev docs
from the public release repo. Full archive lives in claude-code-studio-
testing going forward.
```

**Verify:** `git ls-tree -r origin/master | grep -E '(journal|security-reviews|SESSION_LOG)'`
returns empty.

---

## Category 3 — Tracking infrastructure (PREREQ for cross-machine handoff)

**Goal:** Make the testing repo self-describing so a future Claude on a different
computer can read state and know what to do.

**Files to create in testing (committed at session end):**

1. **`docs/STATUS.md`** — single always-current pickup doc. Sections:
   - **Where we are** (one paragraph)
   - **In progress** (active feature branches + what's done / what's blocking)
   - **Next up** (queued work in priority order)
   - **Known issues / gotchas** (env setup quirks, build flakes)
   - **Local setup on a new machine** (clone, npm install, patch-node-pty, build
     tools required)

   Rewritten at the end of every session.

2. **`docs/SESSION_LOG_2026-05-27_rnd-kickoff.md`** — append-only log for this
   session. Future sessions get their own dated log. STATUS.md links to the most
   recent one.

3. **`docs/HANDOFF.md`** stays as historical context (per the deprecation banner
   already on it). Not rewritten.

4. **GitHub Project board** on the testing repo. One issue per R&D feature in
   Categories 4–7 (see end of plan for the list). Project columns:
   `Backlog → In progress → Done`.

5. **LMM journal** (`journal/`): already present after the sync. Convention from
   the existing entries is preserved — `.lmm.md` files mirror source paths under
   `journal/src/...`. We'll add entries for new files and significant changes.

**Verify:** A fresh `git clone` + `cat docs/STATUS.md` tells the next Claude
exactly what's done, what's in flight, and how to set up.

---

## Category 4 — R&D Phase A: UI foundations (themes + resizable windows + persistence)

These are foundational because everything else builds on them.

### 4.1 — More themes + theme editor

**Existing state:** `src/renderer/theme-presets.ts` defines 6 hard-coded `ThemePreset`
entries (Purple, Blue, Emerald, Rose, Amber, Cyan). `applyTheme()` sets CSS
custom properties and persists name to `localStorage`.

**Changes:**
- Add ~6 more curated presets to `THEME_PRESETS` (e.g. Slate, Indigo, Crimson,
  Forest, Magenta, Midnight, Solarized-Dark).
- New file `src/main/theme-service.ts` — load/save **custom** themes to
  `<userData>/themes.json`. IPC: `themes:list`, `themes:save`, `themes:delete`.
- New component `src/renderer/components/settings/ThemeEditor.tsx` — modal in
  Settings → Appearance:
  - Color pickers for `accent`, `accentLight`, `borderActive` (gradient + glow
    derived automatically from accent).
  - Live preview pane (mini app chrome).
  - Save name → persisted custom theme appears alongside built-ins.
- Modify `applyTheme()` to accept custom presets (signature already supports it;
  storage key needs to include `custom:` prefix to distinguish).

**LMM journal entries:** `journal/src/renderer/theme-presets.ts.lmm.md`,
`journal/src/main/theme-service.ts.lmm.md`,
`journal/src/renderer/components/settings/ThemeEditor.tsx.lmm.md`.

**Verify:** Open the app → Settings → Appearance → switch built-in themes
(instant CSS variable swap), open theme editor, create a custom theme, restart
app, confirm the custom theme is still selected.

### 4.2 — Resizable windows + size persistence

**Existing state:** Main `BrowserWindow` in `src/main/index.ts` and pop-out
windows in `src/renderer/components/models/PopoutView.tsx` use fixed dimensions.
No resize persistence.

**Changes:**
- New `src/main/window-state-service.ts` — read/write
  `<userData>/window-state.json` with per-window-id `{ x, y, width, height,
  maximized }`. Provides `loadState(id, defaults)` and `bindWindow(id, win)`.
- Modify `src/main/index.ts`:
  - Main window: load state on create; bind `resize`, `move`, `maximize`,
    `unmaximize`, `close` to persist.
  - `resizable: true` (it likely already is, but confirm).
- Pop-out windows (`MODELS_POPOUT` IPC): each pop-out gets a stable ID
  (`models-popout:<modelId>`) and uses the same persistence service.
- Settings panel + Command palette + AuthPanel + AddModelModal modals: where
  they're React modals (not separate windows), they remain centered + fixed
  unless the user explicitly wants modals resizable too. Confirm scope.

**LMM journal entry:** `journal/src/main/window-state-service.ts.lmm.md`.

**Verify:** Resize main window, close app, relaunch — restores to last size.
Same for pop-out model windows.

---

## Category 5 — R&D Phase B: Multi-provider plumbing

The 33-model catalog already has placeholder entries for Anthropic / OpenAI /
Gemini / OpenRouter API models. None of the API half is wired. CLIs (Aider /
Gemini-CLI) need PTY paths analogous to Claude. The universal API-key UI lives
here so all subsequent providers reuse it.

### 5.1 — Per-provider API key store

**Existing state:** `src/main/auth-service.ts` handles Anthropic auth only. GitHub
PAT is stored separately. Electron `safeStorage` already proven via GitHub.

**Changes:**
- Extend `src/main/auth-service.ts` (or split into
  `src/main/provider-auth-service.ts`) — generic key/value with
  `safeStorage`-encrypted values, scoped by provider id
  (`anthropic | openai | gemini | openrouter | custom:<id>`).
- IPC: `provider-auth:get(provider)`, `provider-auth:set(provider, key)`,
  `provider-auth:list()`, `provider-auth:delete(provider)`. Returns `boolean`
  for `get` (presence), never the raw key to renderer.
- Storage file: `<userData>/provider-auth.json` — encrypted blobs only.

### 5.2 — Universal API key popup UI

**Behavior the user specified:** "Both, but don't make it overbearing. Make it a
simple dismiss. Don't do it on every launch."

**Approach:**
- **Primary path (pre-launch form):** When user selects an API-provider model in
  `ModelsPanel`, before spawning, check `provider-auth:get(provider)`. If
  missing → show modal `ApiKeyModal.tsx` with:
  - Single password input (masked).
  - Help text linking to where to get the key.
  - "Save & launch" + "Dismiss" buttons.
  - Dismiss closes without launching the model — no nagging.
  - Save stores via `provider-auth:set` then continues launch.
- **Fallback path (PTY interception):** New `src/main/pty-key-interceptor.ts` —
  attached to specific provider PTYs. Watches stdout for known prompt patterns
  per CLI (a small regex map: `aider → /Enter your.*API key/i`, etc.). On match,
  emits IPC to renderer → reuse `ApiKeyModal`. Renderer writes the key back
  through PTY stdin + saves it via `provider-auth:set` for next time.
  Conservative: only enable for providers known to prompt; users can disable
  per-provider in Settings.

**Files:**
- New: `src/main/provider-auth-service.ts`,
  `src/main/pty-key-interceptor.ts`,
  `src/renderer/components/auth/ApiKeyModal.tsx`,
  `src/renderer/components/auth/ProviderKeysList.tsx` (in Settings → Providers).
- Modified: `src/renderer/components/models/ModelsPanel.tsx` (pre-launch check),
  `src/main/pty-registry.ts` (env-var injection on spawn),
  `src/shared/ipc-channels.ts`, `src/shared/types.ts`.

**LMM journal entries:** all new files above.

**Verify:**
- Select an API model with no key → modal appears → save key → model launches
  with `OPENAI_API_KEY=...` env var → next launch of same provider no modal.
- Dismiss modal → no launch, no nagging on next click unless user retries.
- Spawn aider without env var → CLI prompts → interceptor catches it → modal
  shows → key saved + sent → CLI proceeds.

---

## Category 6 — R&D Phase C: New providers (Gemini CLI + Aider + OpenRouter)

**Goal:** Add real provider wiring so the catalog's API half works.

### 6.1 — Provider abstraction

**Existing state:** `ModelRegistry` model entries have `provider`, `command`,
`args`. `PtyRegistry.spawn()` already accepts those. Today only Claude
(`claude`) and Ollama (`ollama run <model>`) are exercised.

**Changes:**
- New `src/main/providers/` directory with one file per provider:
  - `claude-provider.ts` (refactor of existing logic),
  - `ollama-provider.ts` (refactor),
  - `gemini-provider.ts` (new — spawns `gemini` CLI; env: `GEMINI_API_KEY`),
  - `aider-provider.ts` (new — spawns `aider`; env mapping: chooses key from
    `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` based on model
    prefix per aider docs),
  - `openrouter-provider.ts` (new — uses the OpenAI-compatible endpoint; for
    PTY-based use, wraps Aider with `--openai-api-base` or spawns a thin
    Node helper that proxies via fetch).
- Each provider exports:
  - `id`, `displayName`,
  - `detect(): Promise<{ available: boolean; path?: string; version?: string }>`,
  - `spawnArgs(model: ModelEntry): { command: string; args: string[]; env: Record<string,string> }`,
  - `keyPromptPattern?: RegExp` (for the interceptor in 5.2).
- New `src/main/provider-registry.ts` — aggregates the providers, exposes
  `getProvider(id)`. `PtyRegistry.spawn()` uses it instead of hard-coding.

### 6.2 — Catalog updates

- Update `<userData>/model-registry.json` seed in `model-registry.ts` to include
  real Gemini + Aider entries with correct `provider`, `command`, `args`.
- Expose "Add provider" UI in Settings — currently only Anthropic is special.

### 6.3 — Model auto-detection in catalog

- On first run, query each available provider's `detect()`; only show its
  catalog entries if detected. Otherwise show with a "Setup" badge → opens
  install instructions modal.

**Files:**
- New: `src/main/providers/*.ts`, `src/main/provider-registry.ts`,
  `src/renderer/components/models/ProviderSetupModal.tsx`.
- Modified: `src/main/model-registry.ts`, `src/main/pty-registry.ts`,
  `src/renderer/components/models/ModelsPanel.tsx`.

**LMM journal:** `journal/src/main/providers/*.lmm.md` (one per provider) +
`journal/src/main/provider-registry.ts.lmm.md`.

**Verify:** Install aider (`pip install aider-chat`), launch via ModelsPanel,
confirm correct PTY env vars are present and CLI runs without re-prompting.

---

## Category 7 — R&D Phase D: Ollama autostart on app launch

**Goal:** When the app starts, if any local (Ollama) models are registered, spawn
the Ollama daemon in the background so the first model launch is instant.

**Existing state:** Ollama daemon startup is deferred to first `ollama run`
implicit start. `ollama-service.ts` already has detect / list / pull.

**Changes:**
- Modify `src/main/ollama-service.ts`:
  - Add `daemonStart()` — runs `ollama serve` detached, captures PID, monitors
    health via `ollama list` (which fails if daemon down).
  - Add `daemonStop()` — sends SIGTERM; cleanup on app quit.
  - Track `daemonState: 'stopped' | 'starting' | 'running' | 'failed'`.
- Modify `src/main/index.ts` `app.whenReady()`:
  - After ModelRegistry loads, check for any `provider === 'ollama'` entries.
  - If found AND Ollama is installed → call `ollamaService.daemonStart()`.
  - Hook `app.on('before-quit', () => ollamaService.daemonStop())`.
- IPC: `ollama:daemon-state`, `ollama:daemon-restart` for the renderer to surface
  state in StatusBar.
- Settings toggle (recommended option from user) deferred — default is "only if
  local models are registered."

**LMM journal:** update `journal/src/main/ollama-service.ts.lmm.md`.

**Verify:** With a local model in the registry, start the app → check Task
Manager for `ollama.exe` daemon process → launch the model → no startup latency
(daemon is already warm). Without any local model in registry, no daemon process.

---

## Category 8 — R&D Phase E: Installer overhaul (Ollama opt-in + modernized UI)

**Goal:** Replace the current silent-Ollama-detect-only flow with an opt-in
prompt during install, plus refresh the installer chrome.

**Existing state:** `build/installer.nsh` Step 5 is detection-only (after the
beta.1 bundling rollback). `electron-builder.yml` `nsis` block has placeholders
for `installerIcon`, `installerHeader`, `installerSidebar` (commented out, Phase 5).

### 8.1 — Modernized installer chrome

- Design + add the BMP assets (NSIS expects classic Windows BMP — 150×57
  header, 164×314 sidebar):
  - `build/installerHeader.bmp`
  - `build/installerSidebar.bmp`
  - `build/installerIcon.ico` + `build/uninstallerIcon.ico`
- Uncomment the references in `electron-builder.yml` `nsis` block.
- Add `oneClick: false` + `allowToChangeInstallationDirectory: true` to expose
  a real (modern-looking) installer wizard. Current config is silent one-click.

### 8.2 — Ollama opt-in page

NSIS has limited UI but supports custom pages via `Page custom` directives.
We'll use `nsDialogs` for a single yes/no page inserted between the welcome
page and the install page:

- New macro `OllamaChoicePage` in `build/installer.nsh`:
  - Heading: "Local AI Models (Optional)"
  - Body: "Claude Code Studio supports running local AI models via Ollama.
    Install Ollama now (~700 MB download) so local models work out of the
    box, or skip — you can install Ollama later from inside the app."
  - Radio buttons: `( ) Install Ollama (recommended for local models)`,
    `( ) Skip — Claude API only`.
  - Stores result in `$OllamaChoice` var.
- New macro `OllamaInstall` (only runs if `$OllamaChoice == "install"`):
  - Restore the bundled-flow code from
    `_backups/2026-05-26-pre-fullscope/build/installer.nsh` but with curl +
    `OllamaSetup.exe /verysilent /norestart`.
  - Soft-fail behavior preserved — Studio installs regardless.
  - Show progress in NSIS DetailPrint + a real progress bar via
    NSIS `Banner` plugin or `nsisdl` if needed.

### 8.3 — First-run behavior wiring

- If user picked "Skip" but later registers a local model in the app, the
  existing FirstRunPicker → "Install Ollama" link still works (one-click to
  ollama.com). No change.

**Files:** `build/installer.nsh` (heavy mod), `electron-builder.yml` (NSIS
config), new BMP assets, `docs/INSTALLER_REDESIGN.md` (updated to reflect
new flow — note this doc is testing-only after Category 2).

**LMM journal:** `journal/config/installer.nsh.lmm.md`.

**Verify:** Build a fresh installer with `npm run dist:win`, run on a clean
VM, confirm:
- Modernized chrome shows header + sidebar BMPs.
- Ollama prompt page appears with both options selectable.
- Choosing "Install Ollama" downloads + runs OllamaSetup silently.
- Choosing "Skip" completes install without touching Ollama.
- App's runtime detection picks up the Ollama install correctly.

---

## Category 9 — Multi-provider brainstorm doc

Per the original ask, `docs/MULTI_PROVIDER_BRAINSTORM.md` in testing captures the
provider landscape so future work has context:
- Provider taxonomy (CLI vs. API vs. local-daemon).
- Each candidate: Gemini CLI, Aider, Codex (status of OpenAI's CLI — there is no
  official CLI, so OpenAI access goes via Aider/OpenRouter/raw API), OpenRouter,
  llama.cpp (alternative to Ollama).
- Auth pattern per provider (env var name + where the key is generated).
- Why a thin provider abstraction is needed (the v3 catalog already has the data
  model — we're just wiring the runtime).

Skim-able reference, not a design doc. Written alongside Category 6 implementation.

---

## Execution model

**Each category is its own feature branch off `testing/master`** with naming
`feature/<category-short-name>`:
- `feature/sync-and-cleanup` (Categories 1–2)
- `feature/tracking-infra` (Category 3)
- `feature/ui-foundations` (Category 4)
- `feature/multi-provider-plumbing` (Category 5)
- `feature/providers-gemini-aider-openrouter` (Category 6)
- `feature/ollama-autostart` (Category 7)
- `feature/installer-overhaul` (Category 8)

PR each branch to testing/master. Categories 4–8 can run in **parallel agents**
once Categories 1–3 are merged, since their file overlap is limited
(theme/window vs. provider/auth vs. installer touch different subtrees).

**LMM rigor:** new files + significant changes get a `.lmm.md`. Skip for one-liners,
dep bumps, and renames.

**Compact controller:** already wired in `~/.claude/settings.json` (we fixed the
hooks shape earlier this session). Operates automatically — nothing to do.

**Cross-machine handoff:** At end of every working session, update
`docs/STATUS.md` + append to today's `docs/SESSION_LOG_*.md` + commit + push to
testing. A fresh clone + `cat docs/STATUS.md` is the entry point on any machine.

---

## Critical files referenced

**Sync / cleanup:** `git`, `gh` (no in-repo file edits, just remote operations).

**Tracking infra:** `docs/STATUS.md` (new), `docs/SESSION_LOG_<date>.md` (new),
GitHub Projects on testing repo.

**Category 4:** `src/renderer/theme-presets.ts`, `src/main/index.ts`,
`src/renderer/components/settings/SettingsPanel.tsx`,
`src/renderer/components/models/PopoutView.tsx`.

**Category 5:** `src/main/auth-service.ts`, `src/main/pty-registry.ts`,
`src/shared/ipc-channels.ts`, `src/renderer/components/models/ModelsPanel.tsx`.

**Category 6:** `src/main/model-registry.ts`, `src/main/pty-registry.ts`,
new `src/main/providers/`, new `src/main/provider-registry.ts`.

**Category 7:** `src/main/ollama-service.ts`, `src/main/index.ts`,
`src/shared/ipc-channels.ts`.

**Category 8:** `build/installer.nsh`, `electron-builder.yml`,
new `build/installer*.bmp`/`*.ico`.

---

## Verification (end-to-end)

After all categories merged to testing:
1. **Clone fresh:** `git clone https://github.com/LxveAce/claude-code-studio-testing`
   on a clean machine.
2. **Read pickup doc:** `cat docs/STATUS.md` — should describe what's shipped.
3. **Build:** `npm install`, `npm run dev` — app launches with new theme,
   resizable windows.
4. **Theme editor:** create custom theme, restart, theme persists.
5. **Provider:** select an OpenAI model in ModelsPanel without saved key →
   modal appears → save → model launches with env var.
6. **Ollama:** add a local model entry → restart app → `ollama.exe` daemon
   running in background.
7. **Installer build:** `npm run dist:win` → run installer in VM →
   modernized chrome, Ollama opt-in page appears, both paths complete.
8. **Cross-machine:** on a different computer, fresh clone, follow STATUS.md
   "Local setup" section, app builds and runs.

---

## Open questions / things to confirm during execution

- **OpenAI direct provider:** OpenAI doesn't ship an official CLI. Options are
  (a) skip OpenAI-as-its-own-provider and access GPT models via Aider /
  OpenRouter, or (b) write a thin in-house wrapper that uses the OpenAI Node SDK
  and pipes its REPL through a PTY. Confirm during Category 6.
- **Modal resize scope:** Category 4.2 limits window-resize-persistence to top-
  level `BrowserWindow`s. If you want React modals (ApiKeyModal, AddModelModal,
  ThemeEditor) to be resizable too, that's a separate React change — say so
  during Category 4 review.
- **NSIS BMP design:** Category 8.1 needs actual artwork. Stub with placeholders
  if no design assets exist; final art is a separate task.
