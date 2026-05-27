# Verification Report — 2026-05-27 (post-fix-pass + chat-skin)

> Coverage: every shipped feature from the R&D push (Cat 1–9), the post-audit
> fix pass (PR #13), and the chat-skin overlay (PR #14). Distinguishes
> **code-verified** (static analysis confirms the path is correct) from
> **runtime-verified** (actually exercised in the running app) from
> **needs-runtime-test** (depends on UI interaction we can't simulate from CLI).

---

## Boot smoke test (runtime)

Ran `npm start`, waited 20s, listed processes:

```
claude.exe                    9440 Console   ...
electron.exe                 34696 Console   ...
electron.exe                  4968 Console   ...
electron.exe                 35520 Console   ...
electron.exe                 22936 Console   ...
```

✅ **Result**: Electron main + 3 renderers alive. The default `claude.exe`
PTY auto-spawned. **Zero error output in stdout** during 20-second window.

This confirms the app boots cleanly post all changes (R&D push + fix pass +
chat skin). Vite-build and TypeScript-compile are also clean.

---

## Feature-by-feature

### Cat 4.1 — Themes (built-in + custom + editor)

- **Built-in themes (13)**: ✅ Code-verified. `THEME_PRESETS` in
  `src/renderer/theme-presets.ts` has 13 entries. SettingsPanel grid
  iterates with `[...THEME_PRESETS, ...customThemes]`.
- **Theme application on startup**: ✅ Code-verified. After the fix-pass,
  `App.tsx` is the single source of truth — reads localStorage on mount,
  resolves custom vs built-in, applies. `SettingsPanel` only seeds its
  picker highlight (no longer races on apply).
- **Custom theme persistence**: ✅ Code-verified.
  `src/main/theme-service.ts` writes `<userData>/themes.json` atomically,
  validates on read/write (`HEX_RE`, length caps).
- **Theme editor modal**: ✅ Code-verified. Color pickers + `deriveThemeFromAccent`
  + live preview + restore-on-dismiss (now uses ref-based cleanup so a
  parent re-render doesn't call a stale callback).
- **Needs runtime test**: actual visual confirmation that all 13 built-ins
  apply, custom-theme save survives a relaunch.

### Cat 4.2 — Resizable windows + state persistence

- **Main window resize/restore**: ✅ Code-verified.
  `window-state-service.ts` loads in `createWindow`; main window has
  `resizable: true`. Off-screen recovery via `screen.getAllDisplays()`.
- **Pop-out windows resize/restore**: ✅ Code-verified. `MODELS_POPOUT`
  handler keys state by `models-popout:<paneId>` and binds the window.
- **Flush on quit**: ✅ Code-verified. `before-quit` calls
  `windowStateService?.flush()`.
- **Needs runtime test**: drag-resize main window, close, relaunch,
  confirm restored size.

### Cat 5 — Multi-provider plumbing

- **Per-provider API key store**: ✅ Code-verified.
  `provider-auth-service.ts` uses `safeStorage`, refuses plaintext by
  default, raw keys never cross IPC (`hasKey` returns boolean,
  `list` returns presence + timestamps only).
- **`ApiKeyModal`**: ✅ Code-verified. Single component, dual `source`
  prop, mounted-ref guard prevents setState-after-unmount.
- **PTY interceptor**: ✅ Code-verified.
  `pty-key-interceptor.ts` attaches only to panes whose provider is
  in `PROMPT_PATTERNS` (Claude/Ollama exempt). 4 KB rolling buffer.
- **Env-var injection at spawn**: ✅ Code-verified. `MODELS_LAUNCH`
  calls `envForProvider(providerId)` and passes via `pty-registry.spawn({ env })`.
- **Settings → API keys (ProviderKeysList)**: ✅ Code-verified.
- **Needs runtime test**: open Settings → set OpenAI key → launch
  Aider → verify env var actually reaches the spawned process.

### Cat 6 — New providers (Gemini, Aider, OpenRouter)

- **Catalog entries**: ✅ Code-verified. Three entries in
  `model-catalog-seed.ts`. The fix-pass corrected the OpenRouter entry
  (removed the conflicting `--openai-api-base` flag).
- **Provider detection**: ✅ Code-verified.
  `provider-detect.ts` after the fix-pass: 8s timeout (was 4s),
  routes through `cli-resolver` for Windows .cmd shims, uses
  `shell: true` on Windows.
- **ProviderSetupModal**: ✅ Code-verified.
  Install hint + URL + retry button.
- **Launch order**: ✅ Code-verified. After the fix-pass:
  detect → key → license → spawn (was: license → detect → key, which
  was bad UX).
- **Needs runtime test**: launch Aider without it installed → modal
  appears. Install Aider → click Retry → proceeds. Provide an
  OPENAI_API_KEY → modal closes; spawn succeeds.

### Cat 7 — Ollama autostart

- **`daemonStart`**: ✅ Code-verified. Force-probes via
  `getVersion(true)` first; skips spawn if externally managed; polls
  up to 15s for reachability.
- **`maybeAutostartOllama`**: ✅ Code-verified. Fires from
  `app.whenReady()`; checks ModelRegistry for `provider==='Ollama'`
  or `command==='ollama'`. Non-blocking.
- **Before-quit cleanup**: ✅ Code-verified. SIGTERM the Studio-spawned
  daemon; externally managed is left alone.
- **`daemonStopAndWait`**: ✅ Code-verified (added in fix-pass). 800ms
  wait on Windows for port release. Not wired to a UI yet — ready for
  a future "Restart daemon" affordance.
- **Needs runtime test**: register a local Ollama model → quit app →
  relaunch → confirm `ollama.exe` daemon in Task Manager.

### Cat 8 — Installer overhaul

- **Wizard mode** (`oneClick: false`): ✅ Code-verified in
  `electron-builder.yml`.
- **BMP chrome**: ✅ Code-verified. BMPs generated by
  `build/gen-installer-assets.mjs`. Committed at correct dimensions
  (150×57, 164×314).
- **MessageBox at install start**: ✅ Code-verified in `installer.nsh`.
  `/SD IDNO` defaults to No on silent installs.
- **Conditional Ollama download**: ✅ Code-verified. Soft-fail
  throughout — Ollama install errors never abort Studio.
- **Needs runtime test**: build `npm run dist` on Windows w/ Dev Mode
  → run installer in clean VM → confirm wizard chrome + MessageBox + both
  Y/N paths work. (Was not built in this session.)

### Cat 9 — Multi-provider brainstorm doc

- ✅ Verified: `docs/MULTI_PROVIDER_BRAINSTORM.md` is committed and
  describes the abstraction + provider taxonomy + open questions.

---

## Fix-pass (PR #13) — what got fixed

| # | Severity | Fix | Status |
|---|---|---|---|
| 1 | CRITICAL | Local-Ollama PATH resolution (the user's reported bug) | ✅ Code-verified |
| 2 | CRITICAL | Provider-detect handles Windows .cmd shims | ✅ Code-verified |
| 3 | HIGH | Provider-detect timeout 4s → 8s | ✅ Code-verified |
| 4 | HIGH | Theme hydration race resolved | ✅ Code-verified |
| 5 | HIGH | ModelsPanel launch order: detect → key → license | ✅ Code-verified |
| 6 | HIGH | `daemonStopAndWait` (Windows port re-bind safety) | ✅ Added; not yet called |
| 7 | MEDIUM | ThemeEditor stale-callback on unmount | ✅ Code-verified (ref pattern) |
| 8 | MEDIUM | ApiKeyModal setState-after-unmount | ✅ Code-verified (mountedRef) |
| 9 | CORRECTNESS | OpenRouter Aider entry — removed conflicting `--openai-api-base` | ✅ Code-verified |

### Local-AI root cause (issue #1)

`node-pty` on Windows does `CreateProcess` directly — no shell. Passing
bare `'ollama'` failed because there's no `.exe` extension and no PATH
search. Claude worked because `findClaudePath()` returned the bundled
runtime's absolute path.

**Fix**: new `src/main/cli-resolver.ts` resolves bare commands via:

1. Well-known install dirs per CLI (`%LOCALAPPDATA%\Programs\Ollama\ollama.exe`,
   `%PROGRAMFILES%\Ollama\ollama.exe`, etc.).
2. `where.exe` (Windows) / `which` (POSIX) OS lookup.
3. Fallback to the bare name with a stderr warning.

`pty-manager.ts` calls the resolver before spawn. `provider-detect.ts`
uses the same resolver + `shell: true` on Windows for npm-installed
`.cmd` shims.

---

## Chat-skin overlay (PR #14)

- **Toggle button**: ✅ Code-verified. Small "✦ Chat" top-right of
  the xterm container when skin is off; full header with "Terminal
  view" button when on.
- **Per-pane persistence**: ✅ Code-verified.
  `skin-prefs.ts` uses `localStorage` keyed by paneId. Initial render
  reads sync so remounts don't flash.
- **Same PTY underneath**: ✅ Code-verified. The xterm stays mounted
  (`visibility: hidden`) when skin is on. Both xterm and overlay
  subscribe to `terminal.onData(paneId, ...)`.
- **Message accumulation**: ✅ Code-verified.
  Sequential PTY chunks append to the LAST assistant message until
  the user sends; then a new assistant message begins.
- **Echo suppression**: ✅ Code-verified. `lastSentRef` matches
  leading substring on first chunk within 1.5s of send.
- **Bounded memory**: ✅ Code-verified. MAX_MESSAGES=200,
  MAX_MESSAGE_CHARS=100k.
- **Needs runtime test**: actual chat exchange — send message → see
  bubble → response arrives in a styled bubble.

---

## What CANNOT be verified without runtime

These require a human clicking through the UI:

- Theme visual rendering for each built-in (13 themes).
- Theme editor live-preview accuracy.
- Custom theme save survives an app restart.
- Window-size restore after relaunch.
- API-key modal actually saves a key + injects env var on spawn.
- PTY interceptor regex matches a real aider/gemini auth prompt.
- Provider-detect finds aider/gemini after installing them mid-session.
- Ollama daemon autostart actually spawns `ollama.exe`.
- Local Ollama model spawn after the PATH fix.
- Installer wizard chrome + MessageBox + both Ollama opt-in paths.
- Chat-skin toggle + bubble rendering + echo suppression in practice.

Everything **shipped** has been TypeScript-compile clean, Vite-build
clean, and the app boots cleanly. The pending verification is purely
"does the user-visible behavior match the design" — which is fine
because that's exactly what manual UI testing is for.

---

## Recommended next steps

1. **Manual smoke test on Windows**: open the app, exercise each
   feature (themes, API keys, launch a non-Claude CLI, etc.).
2. **Try the originally broken case**: pull an Ollama model
   (`ollama pull qwen3:8b`), register it in Studio's catalog (or use a
   built-in entry like `ollama.qwen3-8b`), click Launch in
   ModelsPanel. With the fix-pass, this should now spawn correctly
   on Windows even if `ollama` wasn't on PATH at app launch.
3. **Try the chat skin**: spawn Claude, click "✦ Chat" top-right,
   type a message, observe.
4. **Build a Windows installer**: `npm run dist` (Dev Mode required)
   on a clean Windows VM to confirm the Cat 8 wizard + MessageBox
   flow.
5. If anything fails: capture the stderr from the cli-resolver
   diagnostic (`[pty-manager] resolveCommandPath: '...'` lines) —
   those tell you whether the PATH resolution worked or fell back.
