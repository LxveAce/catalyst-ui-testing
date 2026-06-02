# Security / Red-Team Review — Terminal Profiles + Claude (skip permissions)

**Scope:** `feature/terminal-profiles-skip-perms` — two features:
1. Launch any detected system shell (CMD / PowerShell / pwsh / Git Bash / WSL
   on Windows; login shell + bash / zsh / fish / sh on POSIX) as a tab.
2. A "Claude (skip permissions) ⚠" picker entry that launches a Claude tab
   with a **per-launch** `--dangerously-skip-permissions`.

**Files:** `src/main/shell-profiles.ts` (new), `src/main/index.ts`,
`src/main/pty-manager.ts`, `src/main/pty-registry.ts`,
`src/main/session-service.ts`, `src/shared/{types,ipc-channels}.ts`,
`src/preload/preload.ts`, `src/declarations.d.ts`,
`src/renderer/components/terminal/{TerminalTabs,TerminalPanel}.tsx`,
`src/renderer/App.tsx`.

**Verification:** `npx tsc --noEmit` → clean (0). `npm run vite:build`
(main + preload + renderer) → clean (0). Runtime/manual smoke list below.

---

## Findings

### H-1 — Restart dropped the per-launch flag / model command  **[FIXED]**
`TERMINAL_RESTART` did `ptyRegistry.kill(paneId); ptyRegistry.spawn(paneId)`
with **no opts**. Consequences:
- A "Claude (skip permissions)" tab whose PTY exited and was restarted
  (press-any-key, palette, hotkey, tray) silently respawned **without** the
  flag, while the tab still showed ⚠ — a misleading state for a
  security-relevant toggle.
- (Pre-existing, surfaced by this review) a **model or shell** pane restarted
  the same way respawned the **bundled Claude CLI** on that paneId, dropping
  the model/shell command entirely. cwd was also lost on every restart.

**Fix:** `PtyRegistry` now remembers per-pane launch params (`lastSpawn`:
cwd + opts) and category, and exposes `restart(paneId)` which respawns with
the original parameters. `TERMINAL_RESTART` calls it. Falls back to a bare
spawn when nothing was remembered (panes created before this bookkeeping),
preserving old behavior. Verified: `restart()` captures `lastSpawn` /
`paneCategory` **before** `kill()` (which `dispose()`s both maps).

### M-1 — Shell PTYs not shown in the Resource panel  **[ACCEPTED]**
Shells spawn in the `'other'` resource bucket; `syncResourcePids()` only feeds
`claude` + `model` PIDs to the monitor. A user's plain shell is not part of the
app's AI workload, so omitting it is intended, not a leak — `killAll()` still
reaps them on quit. Documented; no change.

### M-2 — ⚠ reflects the per-launch choice only, not the global toggle  **[ACCEPTED]**
The tab ⚠ marks tabs opened via the "Claude (skip permissions)" entry. If a
user instead enables the **global** Settings → Claude CLI toggle, normal Claude
tabs also run with the flag but show no ⚠. This matches the pre-existing global
toggle's invisible behavior; the per-launch ⚠ is additive, not a global
audit indicator. Documented.

### L-1 — Generic fast-exit hint fires for shells  **[DEFERRED]**
`EmbeddedTerminal`'s "fast exit suggests the CLI rejected something… try the
same command in a regular terminal" hint triggers for any non-`claude` profile
that exits <3s with a non-zero code — including a `shell:*` tab (e.g. `wsl.exe`
with no distro installed). Copy is mildly off for a shell but still points the
user at the real failure. Low; left for a follow-up that special-cases shells.

### L-2 — ✦ Chat skin toggle shown on shell tabs  **[DEFERRED]**
Shell tabs render via `EmbeddedTerminal`, which always offers the chat-skin
toggle. Toggling it on a bash/cmd session is useless but harmless (it just
renders raw bytes through the chat renderer). Low.

### L-3 — Shells (and Claude tabs) launch in home dir  **[PRE-EXISTING]**
`App.tsx` doesn't pass `cwd` to `TerminalTabs`, so new tabs launch in
`os.homedir()`. Pre-existing for Claude tabs; shells inherit the same. Not a
regression. Tracked for a future "open in project cwd" enhancement.

---

## Security posture (no findings)
- **No command injection.** Shell `command`/`args` come from a fixed,
  per-platform allowlist of absolute paths in `shell-profiles.ts` — never from
  renderer input. The renderer only sends a `shellId`, validated against the
  detected set via `getShellProfile()`; an unknown id returns an error.
- **paneId** is synthesized server-side (`shell:<sanitized-id>-<ts>`, ≤64 chars,
  matches the paneId regex). cwd is length-bounded (≤4096).
- **skipPermissions** is a strict `=== true` boolean, honored **only** for
  Claude PTYs (`!opts.command`) and de-duped against an existing flag in argv.
  A malicious renderer can at most toggle one fixed, documented flag — it can't
  inject arbitrary argv.

## Fixed-in-passing
- `session-service.ts` `VALID_PANEL_IDS` was missing `'hf'` → the HF panel
  couldn't be the restored active panel. Added.

## Manual smoke (recommended before/after merge)
1. `+` → picker shows a **Terminals** group with the shells present on the box;
   launch each → real interactive shell in the tab.
2. `+` → **Claude (skip permissions) ⚠** → tab opens; confirm the Claude
   process launched with `--dangerously-skip-permissions` (it should not prompt
   for per-action permission).
3. Plain `+` / Enter → normal Claude tab (no flag, no ⚠).
4. Open a skip-perms tab, let it exit (`/exit` or kill), press a key to
   restart → it respawns **with** the flag (H-1 regression check).
5. Restart a model/shell tab via the palette → it respawns as the same
   model/shell, not Claude (H-1 regression check).
6. Reload the app → a persisted skip-perms Claude tab restores with its ⚠
   label.
