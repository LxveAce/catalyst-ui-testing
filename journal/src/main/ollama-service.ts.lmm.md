# LMM: src/main/ollama-service.ts

> File: `src/main/ollama-service.ts` · LOC: ~480 · Role: Ollama CLI wrapper — install detect, list, pull/cancel/delete, and (Cat 7) daemon lifecycle.

## Phase 1: RAW

This file existed before Cat 7 for the pull/list/delete operations against Ollama. Cat 7 added the daemon lifecycle (`daemonStart`, `daemonStop`, `daemonState`) so the app can autostart `ollama serve` when local models are registered. The user wanted instant first-launch of local models without the cold-start delay of waiting for the daemon.

The trickiest piece is **detecting an externally-managed Ollama and not duplicating it**. On Windows, Ollama's installer registers a tray app that runs `ollama serve` automatically. On macOS, it's a LaunchAgent. On Linux, often a systemd service. If we naively call `ollama serve` again, we get a port conflict error and confused state.

Solution: `daemonStart()` re-probes `getVersion(force=true)` first. If `daemonReachable` is true (someone else is running it), we record `state = 'running'` with `ownedByStudio = false` and skip the spawn. Only if no daemon answers do we spawn our own.

For the spawn itself: `detached: false` so the child inherits Studio's process tree. When `before-quit` fires and calls `daemonStop()`, we SIGTERM the child. If the daemon was externally managed, `daemonStop` is a no-op (no `this.daemonProcess` to kill).

The polling-until-reachable loop is at 400ms intervals up to 15s. Ollama's cold start can take 5-10s the first time on Windows; 15s gives a generous margin. We probe via the existing `getVersion(force=true)` which already does the `ollama list` health check.

## Phase 2: NODES

### Node 1: `ownedByStudio` distinguishes spawn lineage
True iff `this.daemonProcess` is non-null and alive. Why it matters: lets the UI show "Daemon (Ollama tray)" vs "Daemon (Studio-managed)" if it ever needs to. Today only the lifecycle code uses it — daemonStop is a no-op when false.

### Node 2: Re-probe in `daemonStart()` with force=true
Don't trust the cached version probe; force a fresh `getVersion`. Why it matters: an externally-managed daemon might have started between Studio launch and our first daemonStart call.

### Node 3: 400ms × 15s = 37 polls max
Generous because Ollama's cold start is irregular. Why it matters: timing out at 5s would falsely report failure on cold systems.

### Node 4: SIGTERM on stop, no fallback
We don't escalate to SIGKILL. Why it matters: Ollama handles SIGTERM cleanly; SIGKILL would orphan model weights in memory + risk corruption. If the daemon ignores SIGTERM, the OS reaps it when Studio exits anyway.

### Node 5: `daemon-state` event after every transition
Stopped → starting → running, or → failed. Why it matters: renderer can subscribe to render a status pill without polling.

### Node 6: `maybeAutostartOllama` is fire-and-forget
Called from `app.whenReady()`. Why it matters: blocking startup on Ollama would delay the main window for users without local models. Failure mode: daemon starts in the background; first model launch is "warm" if user waited a few seconds.

### Node 7: Eligibility check is "any provider==='Ollama' OR command==='ollama'"
Two ways to flag a model as local. Why it matters: belt-and-suspenders — we want to be liberal about what counts as a local-model registry so autostart fires when it should.

## Phase 3: REFLECT

### Core insight
**The daemon is a shared resource that may be Studio's or someone else's.** All lifecycle ops must check "who owns it now" before acting. Mutating a daemon Studio doesn't own would surprise the user.

### Resolved tensions
- **Node 1 (ownership tracking) vs Node 4 (clean shutdown)**: we only kill processes we spawned. Externally-managed daemons survive `daemonStop`. The Windows tray app keeps running. Confirmed correct behavior.
- **Node 6 (non-blocking autostart) vs Node 3 (15s probe)**: the 15s budget is per-call, but `maybeAutostartOllama` is fire-and-forget so it doesn't block app launch. Worst case: app is responsive immediately, daemon comes up 5s later in the background.

### Hidden assumptions
- Assumed: `ollama list` is a reliable health check. Challenge: returns success when the daemon is reachable but a CLI version mismatch with the daemon may produce mixed signals. Acceptable — the daemon being up is the load-bearing thing.
- Assumed: `kill('SIGTERM')` on Windows works. Challenge: Windows doesn't have real POSIX signals, but Node's `child.kill` maps SIGTERM to TerminateProcess which is graceful enough for our case.
- Assumed: the user only ever wants one Studio-owned daemon. Challenge: holds today — singleton service.

## Phase 4: SYNTHESIZE

### What this file should become
A stable wrapper. Daemon lifecycle is the last big feature; everything else is steady-state. If we ever wanted to query the daemon's HTTP API (port 11434) instead of CLI-spawning `ollama list`, that'd be a separate file (`ollama-http.ts`) — keep the CLI-wrapper role focused.

### Actionable items
- [ ] Surface daemon state in the StatusBar (small icon next to Resource gauges). Currently the user has to open ModelsPanel to see it.
- [ ] Add `daemonRestart()` — single IPC instead of stop + start round-trip.
- [ ] Log the daemon's stdout/stderr to a rotating file so daemon crashes are debuggable. Currently `stdio: 'ignore'` means we lose the diagnostics.

### Risks
- A misbehaving Ollama version that hangs the daemon at startup will exhaust the 15s budget every app launch. Mitigation: surface the failure via `daemon-state` event so the StatusBar can show "Daemon failed to start — click to retry" or similar.
- On Windows, the tray-app Ollama may start a fraction of a second AFTER our `daemonStart` polls. Result: we spawn our own, then the tray's starts and conflicts. Worst case: one daemon errors out, the other survives. Acceptable but worth watching for in logs.
