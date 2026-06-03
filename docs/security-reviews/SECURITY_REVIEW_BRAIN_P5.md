# Security / Red-Team Review — Catalyst Brain P5 (Canvas/Bases, auto-inject, REST client, plugin)

**Scope:** the final tranche on `feature/obsidian-brain` — Canvas/Bases read,
auto-inject context to the active tab, the Local REST API client (live vault),
and the first-party Obsidian plugin scaffold.

**Files:** `src/main/{brain-service,brain-rest-auth}.ts`,
`src/renderer/components/brain/BrainPanel.tsx`, `src/renderer/App.tsx`,
`src/{shared,preload,declarations}…`, `obsidian-plugin/*` (new).

**Verification:** `tsc --noEmit` clean; `vite:build` clean; logic suites 15/15
+ 9/9 + 11/11; **live CDP runtime: Brain panel mounts, 14/14 panels pass, 0
console errors** after all additions.

---

## Findings

### M-1 — REST write/delete on a LIVE vault via IPC  **[INTENDED / gated]**
`brain:rest-append/put/delete-file` let the renderer (and MCP-capable models)
mutate/delete files in a running Obsidian vault. This is the intended "models
drive the vault" capability, but it's powerful and there is **no per-call
confirm**. Mitigations: requires the user to have **saved a REST key** AND have
Obsidian running with the plugin; vault paths are per-segment URL-encoded with
`.`/`..` stripped (no traversal); the panel UI only surfaces **read** ops
(list/search) — writes/deletes are IPC-only for deliberate model use.
**Recommended follow-up:** a confirm/allowlist (or read-only toggle) before
exposing writes to autonomous models. Tracked, not blocking.

### M-2 — Scoped self-signed-cert acceptance  **[ACCEPTED, deliberate]**
The REST client accepts a self-signed TLS cert **only** for loopback hosts
(`127.0.0.1` / `localhost` / `::1`) — exactly the plugin's default. Any
**non-loopback** `https` target keeps full cert validation, so the bearer key is
never sent over an unverified channel to a remote host. This is the minimal,
intentional bypass needed to talk to the local plugin.

### L-1 — Obsidian plugin not runtime-tested  **[KNOWN]**
`obsidian-plugin/` is a buildable scaffold written against the stable public
Obsidian API, but it can't be exercised inside Obsidian from here. It's excluded
from the app's tsconfig and built separately. No Catalyst trust-boundary impact
(it runs in the user's Obsidian, makes no network calls).

### L-2 — Auto-inject sends to the active PTY  **[ACCEPTED]**
"Send to tab" injects Brain text into the active terminal/chat with
`submit:false` (reuses App's existing `onSendCommand` / `sendToActive`, which
strips `\r`), so nothing auto-executes — the user reviews and presses Enter. The
content is the user's own Brain notes.

---

## Security posture (no findings)
- **Canvas/Bases read** is bounded: size cap (`MAX_NOTE_BYTES`), ≤2000 canvas
  nodes mapped, `JSON.parse` guarded (`invalid-json`), `.base` light-parsed (no
  YAML dep) with raw preserved. Both go through the P1 path guard
  (`resolveNotePath`, requireMd off + explicit ext check) — confined to the
  Brain folder.
- **REST paths** can't traverse: `encodeVaultPath` drops `.`/`..` and
  `encodeURIComponent`s each segment.
- **Key handling** unchanged from P4 — encrypted at rest, never returned to the
  renderer; live calls read it only in main.
- No new persistent secrets; no AGPL code copied.

## Manual smoke
1. `.canvas` file → "Canvas & Bases" shows node/edge counts + text nodes;
   `.base` → raw + light-parsed keys. Malformed `.canvas` → `invalid-json`.
2. With Obsidian + plugin running and a saved key: "List vault files" / live
   search return results; with it down → `unreachable` (no crash). Non-loopback
   `https` baseUrl with a bad cert → request fails (validation kept).
3. "Send to tab" drops Brain text into the active tab unsubmitted.
4. `cd obsidian-plugin && npm i && npm run build` → `main.js`; load into a vault,
   "Tag for Catalyst" sets `catalyst_brain: true`, status bar counts it.
