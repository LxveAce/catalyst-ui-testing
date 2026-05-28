# v4.0.3 — Cross-machine transfer for testing

> Shipped 2026-05-28 evening. You can pick this up from home by either
> downloading the installer directly (no git needed) OR by cloning the
> repo and reading this file for full context.

---

## 1. Download v4.0.3 directly (no setup needed)

**Public release:** https://github.com/LxveAce/catalyst-ui/releases/tag/v4.0.3

| Platform | Asset | Size |
|---|---|---|
| Windows | [`Catalyst-UI-4.0.3-Windows.exe`](https://github.com/LxveAce/catalyst-ui/releases/download/v4.0.3/Catalyst-UI-4.0.3-Windows.exe) | 98.8 MB |
| macOS | [`Catalyst-UI-4.0.3-Mac.dmg`](https://github.com/LxveAce/catalyst-ui/releases/download/v4.0.3/Catalyst-UI-4.0.3-Mac.dmg) | 123.8 MB |
| Linux (Debian/Ubuntu) | [`Catalyst-UI-4.0.3-Linux-Debian.deb`](https://github.com/LxveAce/catalyst-ui/releases/download/v4.0.3/Catalyst-UI-4.0.3-Linux-Debian.deb) | 99.5 MB |
| Linux (Fedora/RHEL) | [`Catalyst-UI-4.0.3-Linux-Fedora.rpm`](https://github.com/LxveAce/catalyst-ui/releases/download/v4.0.3/Catalyst-UI-4.0.3-Linux-Fedora.rpm) | 87.5 MB |
| Linux (universal) | [`Catalyst-UI-4.0.3-Linux-Universal.AppImage`](https://github.com/LxveAce/catalyst-ui/releases/download/v4.0.3/Catalyst-UI-4.0.3-Linux-Universal.AppImage) | 129.9 MB |

**Auto-updater metadata** (electron-updater reads these):
- [`latest.yml`](https://github.com/LxveAce/catalyst-ui/releases/download/v4.0.3/latest.yml) (Windows)
- [`latest-mac.yml`](https://github.com/LxveAce/catalyst-ui/releases/download/v4.0.3/latest-mac.yml)
- [`latest-linux.yml`](https://github.com/LxveAce/catalyst-ui/releases/download/v4.0.3/latest-linux.yml)

If you already have v4.0.2 installed: open the app → Settings → Updates → Check for updates. The auto-updater will offer v4.0.3.

**Windows SHA-512** (from latest.yml):
`5lwhmpFvnFkLeHFiWk+kgV/hn9Y3m0SekhpCJh1IRZjvJU7Q+NK2xw8CUkEV8U8G6AsSZpsCu38qP+y//KvPAg==`

---

## 2. What changed in v4.0.3

Strictly bug-fix release.  Four bugs you surfaced via screenshots
in the v4.0.2 dev build, all addressed.  No new features.

### Bug 3 — `Cannot resize a pty that has already exited` (modal error)
**Files**: `src/main/pty-manager.ts`, `src/main/pty-registry.ts`
**What**: When a PTY exited (Claude (Chat) fast-exit, Ollama tab
close, etc.) and the renderer's ResizeObserver / panel re-flow
fired a delayed resize, `PtyManager.resize` called into node-pty
on the dead handle, which threw a synchronous exception that
surfaced as a JavaScript-error modal dialog at the user.
**Fix**: `PtyManager.onExit` now nulls `ptyProcess` /
`childProcess` so subsequent `write` / `resize` calls
short-circuit.  Defensive `try/catch` in `PtyManager.resize`
AND `PtyRegistry.resize` as defense-in-depth.

### Bug 1 — Claude (Chat) yellow diagnostic invisible
**Files**: `src/renderer/components/models/ModelsPanel.tsx`
**What**: v4.0.2 added a fast-exit detector in `EmbeddedTerminal`
that prints a yellow `claude --version` / `npm install -g
@anthropic-ai/claude-code@latest` hint when the CLI rejects the
stream-json flags — but the diagnostic was gated on
`profile === 'api.anthropic.claude-chat'` and `ModelsPanel`
mounted `<EmbeddedTerminal>` without passing `profile`.
**Fix**: now passes
`profile={running.find(r => r.paneId === selectedRunningPaneId)?.modelId}`.
Side effect: the generic "fast exit suggests the CLI rejected
something" hint (any non-claude profile, exit within 3s) now
fires too — useful for the curated-research Import path when
Ollama isn't running.

### Bug 4 — Commands panel empty-state had no escape
**Files**: `src/renderer/components/commands/CommandsPanel.tsx`,
`src/renderer/App.tsx`
**What**: When the active tab was Claude (Chat), the Commands
panel just showed `Stream-JSON mode — type your message in the
composer; slash commands are not processed in this mode.` with
no actionable affordance.
**Fix**: added a CTA banner at the top: `+ Switch to a plain
Claude tab`, wired to App's `handleNewClaudeTab`.  Same flow as
the `+` button in TerminalTabs.

### Bug 2 — Curated research `✓ Launched` downstream
**Fix**: covered by Bug 1 above — the generic fast-exit
diagnostic now fires correctly for non-Claude profiles, so when
you import a curated research model and Ollama isn't running,
you'll see the yellow hint instead of a silent exit-1.

---

## 3. Test plan (when you're home)

Install v4.0.3 (or accept the auto-update).  Then:

### 3.1. Verify PTY resize crash gone
1. Open the app
2. Launch a Claude tab from `+`
3. Close that tab (× button)
4. Quickly resize the right panel (drag the handle) and/or the
   whole window during/just-after close
5. **Expected**: no JavaScript-error modal dialog
6. **Also try**: open Settings panel during the close to force
   a re-flow

### 3.2. Verify Claude (Chat) yellow diagnostic
1. Open the `+` profile picker, select **Claude (Chat)**
   (the entry with the `CLI flags?` amber badge if your
   local Claude CLI doesn't support `--input-format=stream-json`)
2. Wait ~2 seconds for it to spawn + exit
3. **Expected**: yellow diagnostic appears with
   `[The Claude (Chat) profile spawns the CLI with stream-json flags...]`
   followed by the `claude --version` and npm-upgrade hints
4. If your CLI DOES support stream-json, the tab stays alive
   — also fine, just means you don't see the diagnostic

### 3.3. Verify Commands panel CTA
1. Open or switch to a Claude (Chat) tab
2. Click the **Commands** panel in the sidebar
3. **Expected**: at the top of the panel, a button
   `+ Switch to a plain Claude tab` with subtitle
   `slash commands & quick actions`
4. Click it
5. **Expected**: a new Claude tab spawns and the panel
   switches to Terminal view

### 3.4. Verify curated research diagnostic
1. Open the **Hugging Face** panel
2. Switch to the **Research** tab (you may need to enable
   research mode first via the disclaimer)
3. Click **Import** on any curated card (e.g.
   `bartowski/Llama-3.2-3B-Instruct-uncensored-GGUF`)
4. Wait — if Ollama is running and pulls successfully, the
   model tab stays alive; if Ollama isn't running OR the pull
   fails, **expected**: yellow fast-exit hint appears in the
   spawned tab pointing you at the underlying command

### 3.5. Regression sanity (anything broken?)
- Sidebar panel switching (all 12+ panels)
- HF Browse search + GGUF filter + Details expansion
- LMM panel create → edit → save → delete cycle
- Models panel catalog filtering + Copy command
- Settings panel sections (Accent, Accessibility, Hotkeys,
  Danger Zone, Updater)

---

## 4. Repo / build state at ship time

| | |
|---|---|
| **public master HEAD** | `00ea994` — `release(v4.0.3): strict bug-fix for v4.0.2 dev-build screenshots (#15)` |
| **testing master HEAD** | `f3a4dc7` — `fix(v4.0.3): PTY resize crash + diagnostic visibility + Commands CTA (#51)` |
| **public release** | https://github.com/LxveAce/catalyst-ui/releases/tag/v4.0.3 — `latest=true`, `draft=false`, `prerelease=false`, 8 assets |
| **testing release** | https://github.com/LxveAce/catalyst-ui-testing/releases/tag/v4.0.3 — 8 assets uploaded |
| **public CI** | run `26602230704` — green |
| **testing CI** | run `26601600660` — green |
| **PR (testing)** | https://github.com/LxveAce/catalyst-ui-testing/pull/51 — merged |
| **PR (public)** | https://github.com/LxveAce/catalyst-ui/pull/15 — merged |

---

## 5. Audit state pre-ship

All 5 CDP audit harnesses ran green:

| Audit | Score |
|---|---|
| `scripts/hf-cdp-test.mjs` | 32/32 |
| `scripts/hf-button-audit.mjs` | 32/32 |
| `scripts/lmm-audit.mjs` | 19/19 |
| `scripts/models-audit.mjs` | 21/21 |
| `scripts/multi-panel-audit.mjs` | 28/28 |
| **Total** | **132/132** |

Zero renderer exceptions, zero `console.error` during scripted
audits. Initial multi-panel run reported 1 console.error caused
by my new CTA banner mixing `border:` shorthand with mouseEnter
`borderColor` longhand mutation — fixed by switching to
longhand triplet (`borderWidth` / `borderStyle` / `borderColor`)
before final ship.

**Known audit gap**: PTY lifecycle (spawn → exit → resize) is not
exercised by any scripted audit.  v4.0.2 shipped with the PTY
resize crash because the harness only drove panel switches and
button clicks.  Add a long-running-terminal smoke harness in
v4.1.

---

## 6. Dev-mode setup (if you want to re-debug at home)

```bash
# Clone (if you don't have it)
git clone https://github.com/LxveAce/catalyst-ui-testing C:/Users/mmrla/claude-code-studio
cd C:/Users/mmrla/claude-code-studio
git remote add origin https://github.com/LxveAce/catalyst-ui

# Install + run with CDP enabled
npm install
npm start -- -- --remote-debugging-port=9222

# In another shell, drive audits
node scripts/hf-cdp-test.mjs
node scripts/hf-button-audit.mjs
node scripts/lmm-audit.mjs
node scripts/models-audit.mjs
node scripts/multi-panel-audit.mjs
```

The audits read CDP at `http://127.0.0.1:9222` — they need dev
mode running first.

---

## 7. Companion docs

- `journal/V4_0_2_BUG_TRIAGE_2026-05-28.lmm.md` — LMM walk that
  identified the 4 bugs after the user dropped screenshots
- `journal/V4_0_3_SHIP_2026-05-28.lmm.md` — LMM walk on the ship
  itself (RAW/NODES/REFLECT/SYNTHESIZE)
- `journal/logs/dev-out-pre-v403.log` — dev console log from the
  v4.0.2 dev session that surfaced the bugs (includes `AttachConsole
  failed` traces from the node-pty `conpty_console_list_agent`,
  unrelated to the resize crash but worth noting for v4.1)
- `journal/logs/dev-out-v403-build.log` — dev mode log captured
  after applying the v4.0.3 fixes (clean — only the harmless React
  shorthand warning fired during audits, fixed before ship)
- `journal/logs/v403-promotion-overlay.patch` — the exact diff
  applied from testing → public via `git apply` (single-overlay
  commit, code+CHANGELOG+package.json only, no docs/journal)
- `CHANGELOG.md` — `[4.0.3] — 2026-05-28` section

---

## 8. Next steps for v4.1 (carry-over to next session)

Add to scratch when you're ready:

1. **PTY lifecycle smoke audit.** v4.0.2 / v4.0.3 both shipped
   without an audit harness that exercises spawn → exit → resize.
   Add one that spawns a tab, lets it run 30s, kills it, fires a
   resize after death, confirms no main-process exception.
2. **EmbeddedTerminal `profile` prop lint rule.** Bug 1 was a
   missing prop.  An ESLint rule or jsx-a11y-style check that
   requires `profile` on every `<EmbeddedTerminal>` mount under
   a known-typed context would prevent regression.
3. **`AttachConsole failed` recurring stack trace from
   `node-pty/lib/conpty_console_list_agent.js:13`** — visible in
   `journal/logs/dev-out-pre-v403.log`.  Not blocking, but a
   chronic noise source.  May be the conpty agent failing to
   attach when no console window exists (Electron renderer host
   process).  Patch in `scripts/patch-node-pty.js` is the likely
   home if we silence it.
4. **Claude (Chat) capability gating.** Current state: picker
   *badges* incompatible (`CLI flags?` chip) but doesn't *block*
   launch.  Consider modal confirm or auto-fallback to plain
   `claude` when streamJson capability probe returns false.
