# LMM: src/main/window-state-service.ts

> File: `src/main/window-state-service.ts` · LOC: ~150 · Role: Persist per-window `{x,y,width,height,maximized}` to `<userData>/window-state.json`; restore on next launch.

## Phase 1: RAW

Before Cat 4, the main BrowserWindow was hardcoded to 1400×900 every launch — no position memory. Pop-out model windows were hardcoded to 900×600. The user explicitly asked to "allow all the windows to be resized" and to "have that setting saved to the same json that allows for settings persistance."

I chose **a dedicated `window-state.json`** rather than folding into another store because:
1. Writes are frequent (every resize/move event). Coalescing them into a high-traffic store would force unrelated reads to wait on debounced writes.
2. Each window's state is independent — keyed by string id (`main`, `models-popout:<paneId>`). A flat record matches that shape naturally.
3. If the file gets corrupted, losing window positions is recoverable in seconds; losing notification settings or vault config is harder.

The key non-obvious behavior is **the "monitor was unplugged" check**. If the user moves the window to a second monitor, then unplugs that monitor, the saved coordinates point off-screen. Without `isOnAnyDisplay()`, the restored window opens invisible and the user can't drag it back. The check uses `screen.getAllDisplays()` and looks for ANY intersection with a connected display's workArea — if none, fall back to defaults (which Electron centers on the primary display).

Debounce is 500 ms. A drag-resize fires 'resize' on every frame; without debounce we'd fsync 30+ times per second. With debounce + change-detection (skip writes when state didn't actually change), we get one write per "user stops moving" event.

`getNormalBounds()` is critical when maximized — without it, we'd save the maximized rect as the "normal" size, and restoring would behave wrong on next unmaximize.

## Phase 2: NODES

### Node 1: Per-window-id keyed map
`states: WindowStateMap = Record<string, WindowState>`. Why it matters: each window's lifetime is independent; one window getting destroyed shouldn't clobber others.

### Node 2: Debounced write with explicit flush
`SAVE_DEBOUNCE_MS = 500`. Why it matters: drag-resize fires `resize` per frame; un-debounced this would write the file 30+ times/sec. `flush()` is called on `app.before-quit` to capture last state.

### Node 3: Off-screen recovery via `isOnAnyDisplay()`
Tested against `screen.getAllDisplays()`. Why it matters: monitor unplugged or laptop closed → saved coords would open invisible.

### Node 4: `getNormalBounds()` when maximized
Electron's `getBounds()` returns the maximized rect when maximized — not the unmaximized geometry. Why it matters: restoring needs the pre-maximize size for when the user unmaximizes.

### Node 5: MAX_TRACKED_WINDOWS = 64
Hard cap on number of distinct ids in the store. Why it matters: pop-out paneIds are UUIDs — without a cap, the file grows unbounded over months of use.

### Node 6: `forget(id)` for explicit eviction
Renderer can drop a popout state when the pane is destroyed. Why it matters: keeps the file from accumulating dead entries even if the count is below MAX_TRACKED_WINDOWS.

### Node 7: All write errors swallowed in the debounce timer
`scheduleWrite` catches and discards. Why it matters: window-state persistence must never crash the app.

## Phase 3: REFLECT

### Core insight
This is a **debounced, off-screen-safe geometry store**. The two non-obvious behaviors (off-screen recovery + getNormalBounds when maximized) are the things future me will forget if they revisit this code.

### Resolved tensions
- **Node 2 vs Node 7**: debounce window means a crash within 500 ms of a resize loses that resize. Mitigated by the change-detection in `capture()` — re-emitting the same state is a no-op.
- **Node 5 vs Node 6**: with MAX_TRACKED_WINDOWS, do we evict LRU or FIFO when over? Currently neither — we just stop accepting new entries on read (oldest-by-iteration-order survive). Reasonable for v1 since the cap is generous.

### Hidden assumptions
- Assumed: `screen.getAllDisplays()` doesn't lie about disconnected monitors. Challenge: on some Linux + Wayland setups, displays may be reported with zero-area workArea. Mitigation: `rectsIntersect()` will return false, fallback kicks in.
- Assumed: a 500 ms debounce is short enough to feel "saves immediately" and long enough to be cheap. Challenge: users on slow disks may still notice. Acceptable trade-off.

## Phase 4: SYNTHESIZE

### What this file should become
A small, focused geometry persistence layer. Stays small. If we ever add per-display zoom factor or DPI awareness, that goes on `WindowState` — but probably never needed.

### Actionable items
- [ ] Wire `forget(id)` from the popout-close path so destroyed paneIds drop out immediately.
- [ ] Consider adding `version: 1` to the JSON store for forward compat (e.g. if we add fullscreen tracking).

### Risks
- Linux Wayland window-position support is patchy. `getBounds()` may return inaccurate coordinates and the restore path could land the window in the wrong workspace. Untested on that platform.
- Multi-DPI setups (HiDPI primary + LoDPI secondary) — saved width/height may need adjustment when restoring on a different display. Currently we save raw px values.
