# Session log — 2026-05-27 evening (post-R&D-kickoff)

Continuation of the morning R&D push (see
`SESSION_LOG_2026-05-27_rnd-kickoff.md`). The morning shipped Cat 1–9 + a
post-audit fix-pass + a chat-skin v1. This evening shipped GPU routing, chat-skin
v2, auth auto-detect, BitNet, multi-model tab UX, the TerminalTabs scaffolding,
and v3.1.0 — driven by rapid user feedback iteration.

The user is going home to a different computer and asked for a handoff. Everything
needed to continue is in this repo — see `STATUS.md` for the pickup doc and the
"Deferred" section for what's left.

---

## What got shipped this evening (in commit order on testing/master)

### Audit-fix pass → atomic JSON writes
- `cli-flags.ts` + `compact-controller.ts` config-write made atomic (tmp+rename).
- Sidebar buttons gained `aria-label` + `data-panel` (a11y + enabled the
  CDP-driven runtime verifier).
- New `scripts/runtime-verify.mjs` — drives Electron via CDP, clicks each
  sidebar tab, captures console events. Verified: **12/12 tabs pass**.

### PR #15 — GPU routing (fixes the user's "my dedicated GPU is ignored" bug)
- **Root cause**: Ollama reads GPU env vars (`CUDA_VISIBLE_DEVICES`,
  `HIP_VISIBLE_DEVICES`, `OLLAMA_VULKAN`, …) at `ollama serve` startup, NOT
  per-`ollama run`. Our code was injecting env into the wrong process.
- Extended `hardware-detection.ts` with `GpuInfo` (vendor / vendorId /
  isDedicated / backend / index). iGPUs (`vramDynamic`) correctly excluded.
- New `gpu-prefs.ts` JSON store + `buildDaemonEnv()` produces the env dict.
- `OllamaService.daemonStart()` now passes that env. New `daemonRestart()`
  for prefs changes.
- ModelsPanel hardware banner has "GPU routing: Auto / Force GPU / Force CPU"
  dropdown with per-GPU picker. Apply button restarts daemon.
- **Also shipped here (Cat 26)**: Liquid AI LFM2.5 350M + 1.2B catalog entries
  + new `'jetson-thor'` hardware tier (tagged on 28 workstation-class entries).
  Skipped BitNet (added later in PR #17).

### PR #16 — chat-skin redesign v1 + multi-model tab strip (Models panel)
- Drop iMessage bubbles; centered 768px column.
- Markdown rendering (react-markdown + remark-gfm + react-syntax-highlighter).
- Running-models tab strip with status dot + name + popout + close.
- Pop-out button on each running model → separate window.

### PR #17 — chat-skin v2 + per-pane popout skin + + tab picker + auth + BitNet
- **Chat skin v2** (user feedback: "still looks horrible"):
  - Persona header at top with avatar + model name + subtitle.
  - Soft rounded bubbles for BOTH roles (no per-message avatars).
  - Pill composer with circular gradient send button.
  - **Aggressive sanitizer**: detects screen-clear escapes (`\x1b[2J`,
    `\x1bc`, `\x1b[?1049[hl]`) and starts a NEW assistant message —
    fixes the "Accessing workspace… Quick safety check…" duplication
    the user screenshotted.
  - `InteractivePromptBanner` above any assistant bubble matching
    selection-menu patterns ("Enter to confirm", "1. Yes 2. No",
    "Select an option", "❯ <number>"). Tells the user to switch to
    Terminal view to respond.
- **EmbeddedTerminal** now hosts the same chat-skin overlay TerminalPanel
  uses, with the same per-paneId localStorage pref. Effect: model panes
  AND popout windows can toggle to chat, AND the choice is preserved
  per pane across reloads.
- **+ New tab picker** in the Models panel's running-strip — opens a
  searchable catalog dropdown grouped API / Local. Same launch gates
  apply (license / CLI-detect / API-key).
- **Auth auto-detect** (`provider-auth-service.detectExisting()`):
  - Returns `source: 'stored' | 'env' | 'cli-oauth' | 'none'` per provider.
  - Anthropic 'cli-oauth' detected by reading `~/.claude.json` /
    `~/.claude/oauth_*.json` for `oauthAccount` / `access_token`.
  - ProviderKeysList shows colored tags (green CLI OAuth, blue env var,
    purple saved). Button label says "Override" instead of "Set" when
    external auth is in play.
- **BitNet b1.58 2B** catalog entry — uses `command: 'bitnet'` (the
  bitnet.cpp runner; not Ollama-compatible). Flagged so the install
  requirement surfaces before launch.
- **TerminalTabs scaffolding**: full Windows-Terminal-style tab component
  written at `src/renderer/components/terminal/TerminalTabs.tsx`. NOT
  YET wired into App.tsx (replacement of SplitLayout would be a regression
  if shipped half-done). See "Deferred" in STATUS.md.

### v3.1.0 tag + release
- `package.json` + `package-lock.json` bumped 3.0.0 → 3.1.0.
- `STATUS.md` overhauled with comprehensive handoff for the next session.
- Tagged `v3.1.0` + pushed. `release.yml` workflow on tag-push builds
  installers for Windows + macOS + Linux on GitHub Actions hosted
  runners (which have the right privileges; the agent's local build
  hit a Dev Mode permission error on winCodeSign extraction).
- First v3.1.0 CI build failed with NSIS warning 6001 ("Variable
  OllamaWantsInstall not referenced or never set") — false-positive
  caused by macro-scoped usage. Fixed with a targeted
  `!pragma warning disable 6001` and the tag was force-moved.
  Second build should succeed.

---

## Final history on testing/master (this session)

```
3e3ef90 docs(status): record v3.1.0 release workflow + Dev Mode workaround
5988379 fix(installer): suppress NSIS warning 6001 for OllamaWantsInstall
74ff71e chore(release): bump version to v3.1.0 + handoff STATUS update
aa1040f Merge pull request #17 from LxveAce/feature/chat-skin-v2-and-tabs
d3ad34c feat: chat-skin v2 + auth auto-detect + BitNet + TerminalTabs scaffolding
532783a feat(chat-skin v2 + tabs): per-pane chat skin + popout-preserved + + tab picker
ad8e528 Merge pull request #16 from LxveAce/feature/chat-skin-redesign
a3909a6 feat(chat-skin + multi-model): Claude.ai-style redesign + running-model tab strip
189782b Merge pull request #15 from LxveAce/feature/gpu-routing
63f28aa feat(gpu-routing): dedicated-GPU detection + Ollama daemon env-var routing
ae4640a chore(verify): CDP-driven runtime verification harness + sidebar a11y
d367511 fix(audit): atomic writes for cli-flags.json + compact-controller config.json
```

---

## Deferred — pick up here on the next machine

See `STATUS.md` "Deferred — pick up here" section for the full description.
Short list:

1. **Wire `TerminalTabs.tsx` into `App.tsx`** — replace `SplitLayout`.
   File is ready; needs session-state migration. **~45 min.**
2. **Claude "chat-mode" profile** — `claude --output-format=stream-json`.
   Real fix for the "TUI gets garbled in chat skin" problem. **~90 min.**
3. **Commands tab mirrors active model** — derive from active tab's
   profile. Depends on item #1. **~30 min.**

Total: ~2.5–3 hours focused work + ~10 min CI wait per release build.

---

## Verification posture at session end

- ✅ TypeScript compile clean.
- ✅ Vite production build clean.
- ✅ Latest CDP runtime verifier run: **12/12 sidebar tabs pass**, zero
  console errors / exceptions during boot + tab-switch sequence.
- ⚠ Local `npm run dist` build attempted by the agent — failed at NSIS
  step on a Windows Dev Mode permission error (winCodeSign symlinks).
  CI workflow on the v3.1.0 tag is the working path; check
  `LxveAce/claude-code-studio-testing/releases/tag/v3.1.0` for assets.
- ❌ No runtime smoke of the actual chat-skin v2 + GPU routing UI on a
  real machine — the agent can't click through Electron UIs. That's
  for the user's manual verification at home.

---

## Files added or restructured this evening

- `src/main/gpu-prefs.ts` (new)
- `src/main/hardware-detection.ts` (extended with GpuInfo + ollamaCompat)
- `src/main/ollama-service.ts` (daemonStart env + daemonRestart)
- `src/main/provider-auth-service.ts` (detectExisting + AuthSource)
- `src/main/model-catalog-seed.ts` (Liquid + BitNet entries + jetson-thor)
- `src/renderer/components/chat-skin/ChatSkinOverlay.tsx` (full rewrite v2)
- `src/renderer/components/chat-skin/skin-prefs.ts` (new — per-pane local pref)
- `src/renderer/components/auth/ProviderKeysList.tsx` (auth source tags)
- `src/renderer/components/models/EmbeddedTerminal.tsx` (chat-skin toggle)
- `src/renderer/components/models/ModelsPanel.tsx` (tab strip + GpuRoutingRow + TabModelPicker)
- `src/renderer/components/layout/Sidebar.tsx` (aria-label + data-panel)
- `src/renderer/components/terminal/TerminalTabs.tsx` (new — scaffolding, not wired)
- `scripts/runtime-verify.mjs` (new — CDP-driven harness)
- `build/installer.nsh` (NSIS pragma fix)
- `package.json` / `package-lock.json` (v3.1.0)
- `docs/STATUS.md` (comprehensive handoff)
- `docs/PLAN_2026-05-27_rnd-push.md` (copy of the original plan, now in-repo)
- `docs/SESSION_LOG_2026-05-27_evening.md` (this file)
- `docs/VERIFICATION_2026-05-27.md` (verification report)

---

## Handoff checklist (use this at home)

1. `git clone https://github.com/LxveAce/claude-code-studio-testing.git`
2. `cd claude-code-studio-testing`
3. `cat docs/STATUS.md` — orient yourself.
4. `cat docs/PLAN_2026-05-27_rnd-push.md` — the original plan (if you want
   the deeper context for why each Cat exists).
5. `cat docs/SESSION_LOG_2026-05-27_evening.md` — what happened tonight.
6. `npm install && npm start` to launch the app in dev.
7. To grab a pre-built installer instead of building locally: download
   from https://github.com/LxveAce/claude-code-studio-testing/releases/tag/v3.1.0
   (once the CI workflow completes — check Actions tab).
8. To continue the deferred work: open `src/renderer/components/terminal/TerminalTabs.tsx`,
   then `src/renderer/App.tsx` — items #1, #2, #3 in STATUS.md "Deferred".
