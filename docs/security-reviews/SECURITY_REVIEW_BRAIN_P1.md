# Security / Red-Team Review — Catalyst Brain P1 (Brain Folder Service)

**Scope:** `feature/obsidian-brain` — P1 only: the main-process Brain Folder
Service that reads/writes an Obsidian-compatible `.md` folder.

**Files:** `src/main/brain-service.ts` (new), `src/main/index.ts` (`setupBrain`),
`src/shared/{types,ipc-channels}.ts`, `src/preload/preload.ts`,
`src/declarations.d.ts`.

**Verification:** `npx tsc --noEmit` → clean (0). `npm run vite:build`
(main+preload+renderer) → clean (0). Pure-logic suite (frontmatter split, light
parse, wikilinks, fenced-code-aware headings, line diff) → **15/15 pass**.
Runtime end-to-end not yet exercisable — no renderer Brain panel in P1; the IPC
surface is fully wired and callable.

---

## Findings

### M-1 — Symlink can escape the Brain root  **[KNOWN / DEFERRED]**
`resolveNotePath` guards against `..`/absolute/prefix traversal **lexically**
(`path.resolve` + `startsWith(root + sep)`), but does not `realpath()`. A
symlink whose *lexical* path is inside the Brain folder but whose target is
outside would pass the guard, so a read/write would follow it out of root.
- **Exposure is low:** the Brain folder is user-chosen and user-owned; this
  requires a malicious symlink already inside the user's own notes folder.
- **Consistent with existing code:** `ProjectExplorer` (FileTreePanel) uses the
  same lexical guard.
- **Hardening (P-next):** `realpath` the resolved target and re-check it's under
  `realpath(root)` before any write; refuse `type === 'symlink'` entries on
  write. Tracked, not blocking P1.

### M-2 — No full YAML parse (by design)  **[ACCEPTED]**
Frontmatter is light-parsed (scalars, inline `[a,b]`, block `- item` lists) for
`title`/`tags`/`aliases` display only; complex YAML (nested maps, anchors,
multiline) is **not** interpreted. **Mitigated:** the raw frontmatter block is
preserved verbatim and never rewritten on a body edit, so nothing is lost —
worst case a complex field just isn't surfaced in `frontmatter`. `js-yaml` is
only a *transitive* dep (via electron-builder), so importing it into shipped
main code is unsafe (externals/bundling could drop it); a real `yaml` dependency
can upgrade this in P2.

### L-1 — Empty frontmatter (`---\n---`) treated as body  **[ACCEPTED]**
The frontmatter regex requires content between the fences, so a degenerate empty
block isn't recognized. Harmless (it just becomes body text); Obsidian doesn't
emit empty frontmatter in practice.

---

## Security posture (no findings)
- **Path scoping:** every note path is `path.resolve`d under the configured root
  and rejected unless it equals root or starts with `root + sep`. Absolute
  inputs and Windows drive letters are rejected up front; `IGNORE_DIRS`
  (`.git`, `.obsidian`, `node_modules`, `.trash`, `.catalyst`) are blocked at any
  segment; non-`.md` targets are rejected for note ops. (Symlink caveat: M-1.)
- **Diff before write:** `previewWrite` / `previewDelete` return the old/new
  content + a line diff so the UI shows exactly what changes before committing.
- **Optimistic concurrency:** `readNote` returns a SHA-256 of the raw file;
  `writeNote(expectedHash)` refuses with `conflict` if the file changed
  underneath (external editor / Obsidian Sync) — no silent clobber.
- **Atomic writes:** tmp-in-same-dir + `rename` (never a partial file); matches
  `cli-flags` / `session-service`. Config writes use the same pattern + `0o600`.
- **DoS bounds:** ≤5000 notes listed, ≤5 MB per note read, walk depth ≤12, rel
  path ≤1024 chars.
- **IPC validation:** every `setupBrain` handler coerces non-string args; the
  renderer can only address paths *inside* the chosen Brain folder.
- **Naming hygiene:** "Brain" is kept distinct from the compact-controller
  "vault" in all types/IPC/UI per the decided naming split.

## Manual smoke (when a renderer panel exists / via a scratch caller)
1. Pick a Brain folder → `getConfig().ready === true`.
2. `listNotes` returns `.md` files (skips `.obsidian`/`.git`); `truncated` true
   past 5000.
3. `readNote` round-trips frontmatter raw + light-parsed tags/aliases + body +
   links + headings; `hash` stable.
4. `previewWrite` shows a correct diff; `writeNote` with a STALE `expectedHash`
   returns `conflict`; with the fresh hash succeeds.
5. Traversal attempts (`../outside.md`, absolute path, `.obsidian/x.md`) all
   return `outside-root`/`invalid-path`, never touch disk outside root.
6. `createNote` on an existing path → `already-exists`; `deleteNote` after
   `previewDelete`.
