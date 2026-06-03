# Security / Red-Team Review — Catalyst Brain P2–P4 (+ renderer panel)

**Scope:** `feature/obsidian-brain` — the Brain renderer panel, P2 (Brain
Writer / unification), P3 (RAG index), P4 (obsidian:// + Local REST API key).

**Files:** `src/renderer/components/brain/BrainPanel.tsx` (new),
`src/renderer/{App.tsx,components/layout/Sidebar.tsx}`,
`src/main/{brain-writer,brain-index,brain-rest-auth}.ts` (new),
`src/main/{index,session-service}.ts`,
`src/shared/{types,ipc-channels}.ts`, `src/preload/preload.ts`,
`src/declarations.d.ts`.

**Verification:** `tsc --noEmit` clean (0); `vite:build` (main+preload+renderer)
clean (0); pure-logic suites — P1 15/15, RAG (cosine/chunk) 9/9.

---

## Findings

### M-1 — Indexing is synchronous + sequential  **[ACCEPTED / bounded]**
`BrainIndex.rebuild` embeds chunks one at a time with a 20 s per-call timeout,
capped at `MAX_CHUNKS = 8000`. A very large vault is slow to first index.
Mitigated by **incremental rebuild** (unchanged notes reuse cached vectors, keyed
by content hash) so steady-state re-indexing is cheap, and by the hard cap
(logged via `truncated`). Batching/parallel embeds is a future optimization, not
a correctness/security issue.

### M-2 — `baseUrl` for the Local REST API is user-set and used with the key  **[ACCEPTED]**
`restTest` (and future requests) send `Authorization: Bearer <key>` to the
stored `baseUrl`. If a user points `baseUrl` at a non-local host, the key goes
there. It's the user's own config (defaults to `https://127.0.0.1:27124`), the
key never crosses to the renderer, and it's opt-in. Documented in the UI.

### L-1 — Self-signed cert blocks real REST calls  **[KNOWN]**
The plugin defaults to HTTPS with a self-signed cert; Node `fetch` rejects it.
`restTest` detects this and reports it as effectively-connectable. Full
request routing (MCP) will need explicit per-request cert handling — deferred to
the MCP wiring phase. Storing the key correctly is the P4 deliverable.

### L-2 — `CATALYST_OLLAMA_URL` override trust  **[ACCEPTED]**
The embed endpoint honors a `CATALYST_OLLAMA_URL` env override (default
localhost). An env var is a trusted input; note chunks would be sent wherever it
points. Localhost default keeps embeddings on-device.

---

## Security posture (no findings)
- **Managed writes confined.** P2 entries land only at
  `_catalyst/<slug(source)>/<slug(id)>.md`; `slugify` reduces both segments to
  `[a-z0-9-]`, so a hostile `BrainEntry` over `brain:write-entry` cannot
  traverse out of `_catalyst/`. Untrusted entry fields are sanitized before
  serialization (scalars→string, arrays filtered to strings).
- **obsidian:// is injection-safe.** The URI is `obsidian://open?path=` +
  `encodeURIComponent(absPath)`, where `absPath` comes from
  `BrainService.absPathFor` (the P1 path guard) — never raw renderer input. The
  scheme is fixed; `shell.openExternal` only ever sees a well-formed
  `obsidian://` URI for an in-Brain path.
- **REST key at rest.** Encrypted via `safeStorage` (OS keychain), base64 in
  `<userData>/brain-rest-auth.json` (0600); raw key never returned over IPC
  (`status` exposes only `hasKey` + `baseUrl`); plaintext persistence is
  refused when no keychain is available — matches the GitHub-PAT pattern.
- **RAG data stays local.** Vectors persist to `<userData>/brain-index.json`,
  never into the user's vault; embeddings go to local Ollama by default. Query
  `k` is clamped to 1..50; the build is chunk-capped.
- **Reuses P1 guards.** All note writes (incl. managed + mirrored) go through
  `BrainService.writeNote`, inheriting path scoping + atomic tmp+rename.

## Manual smoke
1. Mirror journals → `_catalyst/{lmm,snippet,cost}/…` notes appear; re-running
   overwrites (no dupes).
2. `brain:write-entry` with `id:"../../evil"` → file lands at
   `_catalyst/manual/evil.md` (slugified), never outside `_catalyst`.
3. Build index with Ollama down → `ollama-unreachable`; with no embed model →
   `model-missing` (both surfaced as guidance, no crash). With model → chunks
   indexed; semantic query returns ranked hits.
4. Edit a note, rebuild → only that note re-embeds (incremental).
5. "Obsidian ↗" on a note → opens `obsidian://open?path=<note>` (no-op message
   if Obsidian/vault absent).
6. Save a REST key → `hasKey` true, file shows base64 (not plaintext); Clear →
   gone; raw key never appears in any IPC response.
