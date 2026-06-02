# Catalyst Brain — Feature & UI Brainstorm

> Companion to [`OBSIDIAN_INTEGRATION.md`](./OBSIDIAN_INTEGRATION.md) (research +
> legal + phased plan). This doc is the **feature catalog + UI/UX design** for the
> best-possible integration. Brainstorm — not all of it ships at once; see the
> phase tags `[P1]`–`[P5]`.

## Vision (one line)

**The Brain is the memory of the whole app:** every session, model, and journaling
stream flows *into* it; every model can draw *from* it — a native, zero-install,
Obsidian-compatible knowledge layer that Catalyst's own models supercharge.

Three principles: **Native-first** (compiled into the `.exe`, no second app) ·
**Open-standard** (plain markdown — opens in real Obsidian, no lock-in) ·
**AI-supercharged** (your 33-model catalog + Ollama is the brain the paid
Obsidian-AI plugins charge for).

---

## A. The Brain substrate (data layer) `[P1]`

- **Native vault folder**, Obsidian-compatible: `.md` + YAML frontmatter, wikilinks
  `[[ ]]`, tags, attachments, `.canvas` (JSON Canvas), `.base` (YAML).
- **Brain Folder Service** (`src/main/brain-*`): scoped read/write, path allowlist,
  **diff-before-write**, atomic writes, file-watch for external edits.
- **Canonical frontmatter schema**: `id / created / updated / source / author /
  type / project / links / tags / status` — the contract every note obeys.
- **Single "Brain Writer"**: all writes funnel through it; stamps schema; **semantic
  dedup on write** (cheap embedding compare before creating a near-duplicate).
- **Multiple brains**: per-project brain, switch like the existing recent-projects.
- **Git-backed history** (optional): the Brain folder as a git repo → free undo +
  audit + the existing GitHub panel can show its history.

## B. Ingestion / unification — the 7 journaling streams `[P2]`

Turn today's fragmented streams into one queryable substrate:

| Stream | Today | → Brain |
|---|---|---|
| LMM cycles | app state | schema-stamped `.md` note per cycle |
| `*.lmm.md` | markdown in `journal/` | imported / linked |
| compact-controller vaults | `vault-*.json` | mirrored as session notes |
| session logs | `docs/SESSION_LOG_*.md` | imported |
| security reviews | `docs/security-reviews/*.md` | imported + tagged |
| cost history | JSON | rolled-up cost notes |
| snippets | JSON | snippet notes (tagged) |

- **Stream adapters** + a **real-time mirror** (watch JSON stores → markdown).
- **Auto-capture**: every Claude/model tab can auto-write a session note (summary,
  decisions, files touched, model used) on close.
- **Importers**: existing markdown / existing Obsidian vault / a `docs/` folder.

## C. The AI brain — RAG + agents `[P3]`

- **Embedding index** over the Brain using catalog embedding models
  (Qwen3-Embedding-0.6B / BGE-M3 / Nomic) via the Ollama bridge. Vector store in
  `userData` (sqlite-vec / LanceDB / HNSW).
- **Chunking** by heading/section, carrying frontmatter as context.
- **"Ask your Brain"** — RAG chat with any catalog model; scope retrieval by
  note/folder/tag.
- **Related notes** (Smart-Connections-style) suggestions per note.
- **Auto-linking** (suggest wikilinks), **auto-tagging / auto-frontmatter**.
- **MOC generation** — a model maintains Map-of-Content index notes.
- **Reconciliation / red-team pass** — scheduled or on-demand model run that dedups,
  merges, and flags contradictions. *Directly implements the LMM red-team
  discipline as a recurring Brain hygiene job.*
- **Agent memory + cross-model cross-talk**: the Brain is a **blackboard** — every
  note is authored + sourced, models read each other's outputs, and `handoff_to:`
  notes chain one model to the next. "What did model X conclude about Y?" becomes a
  filter query.
- **Write-back with approval**: agents propose edits as diffs; user approves (or
  auto-approve inside trusted folders).

## D. Graph & visualization `[P3/P4]`

- **Native graph view** (backlinks/wikilinks) — reimplemented so Obsidian isn't
  required; highlight AI-suggested links.
- **Backlinks / outgoing-links** panel per note.
- **Canvas** (`.canvas`/JSON Canvas) viewer + editor; **AI can populate a canvas**
  (e.g. lay out a research map).
- **Timeline** view of journal entries; **Bases-style** (`.base`) tabular/filtered
  database views.

## E. Authoring / editing `[P3]`

- In-app **markdown editor** (CodeMirror/Milkdown): wikilink autocomplete,
  frontmatter form UI, live preview.
- **"Save to Brain"** from any chat/model output.
- **Note templates** (decision / meeting / bug / idea / build-log...).
- Command-palette: *Capture to Brain*, *Search Brain*, *Reindex*, *Reconcile*.

## F. Sync / portability `[P4]`

- Plain files → user syncs via their own Git / iCloud / Obsidian Sync / Dropbox.
  **Don't fight existing sync.**
- Optionally extend Phase 6 vault-sync to also push the Brain folder (keep the
  naming distinct from the JSON "vault").

## G. Obsidian interop — BYO bridge `[P4/P5]`

- **"Open in Obsidian"** via `obsidian://` URI; detect an installed Obsidian.
- Optional **Local REST API + MCP** bridge: if the user installs coddingtonbear's
  plugin, Catalyst's MCP-capable models get the 7 tools (list/read/search/patch/
  append/delete). Key in `safeStorage` (GitHub-PAT pattern).
- Optional **first-party Catalyst plugin** inside Obsidian (MIT typings) `[P5]`.

## H. Security / safety (cross-cutting, every phase)

- **Path allowlist / scoping** — agents touch only the Brain folder.
- **Diff-before-write + undo** (git-backed).
- **Secret-in-note detection** — scan for API keys/tokens before indexing or
  sending note content to a *remote* model.
- **Local-only mode** — keep everything on Ollama so notes never leave the machine;
  warn before an API model receives note content.
- **Per-folder trust levels**; **audit log** of agent writes (mirror the HF
  research audit-log pattern).

---

## UI / integration architecture

Catalyst's shell = sidebar panels + TerminalTabs + a resizable right panel +
per-tab pop-out (BrowserWindow). The Brain plugs in at **three altitudes** — and
the "best possible" is to do all three:

### 1. Brain sidebar panel (quick) `[P1]`
New 🧠 sidebar entry: search box, **"Ask your Brain"** mini-chat, recent/pinned
notes, **"+ Capture"**. The lightweight everyday surface.

### 2. Brain workspace (deep) `[P3]`
A dedicated full view — open as a **"Brain" tab** in TerminalTabs, or a maximized
panel — a mini-Obsidian:
- **Left rail:** brain switcher · folder tree · tag filter · search.
- **Center:** view switcher → editor · graph · canvas · base (table).
- **Right rail:** backlinks · outgoing links · **AI** (related notes, "ask about
  this note", "suggest links/tags", "summarize").

### 3. Ambient "Brain context" toggle (the killer feature) `[P3]`
A per-model-tab toggle: when **on**, that model's prompts are **RAG-augmented from
the Brain** automatically. A chip shows `🧠 Brain: on · N notes in context`. This
is what makes *every* model in Catalyst "have a brain" — the connective tissue, not
just another panel.

### Plus
- **Pop-out Brain window** (reuse existing per-tab popout infra) for a second
  monitor.
- **Settings → Brain:** vault path(s), embedding model (from the catalog),
  index/chunk settings, security/trust, local-only toggle, Obsidian-bridge config.

### Ties into existing features
- **LMM panel** → writes cycles into the Brain.
- **Sessions / cost** → auto session notes.
- **GitHub panel** → link commits/PRs to Brain notes.
- **HF / models** → the Brain's embedding model is chosen from the catalog.

---

## What makes it "best possible" (differentiators)

1. **Zero-install + no lock-in** — native in the `.exe`, yet plain markdown that
   opens in real Obsidian.
2. **Every model is brain-augmented** (ambient context toggle) — not a bolt-on
   panel.
3. **Multi-model provenance** — every note knows which model/method authored it;
   models genuinely cross-talk via the blackboard.
4. **Reconciliation/red-team pass** — recurring AI hygiene that fits the LMM
   discipline; nobody else ships this.
5. **Local-only privacy mode** — your notes can stay 100% on-device (Ollama).
6. **Free brain** — does what Copilot Plus charges for, using models the user
   already runs.

---

## Suggested build order (maps to OBSIDIAN_INTEGRATION.md phases)

1. `[P1]` Brain Folder Service + 🧠 sidebar panel (search/capture) + native vault
   read/write. *Smallest shippable slice; proves the substrate.*
2. `[P2]` Canonical schema + Brain Writer + stream adapters (unify the 7 streams).
3. `[P3]` Embedding/RAG index + "Ask your Brain" + **ambient Brain-context toggle**
   + editor + related-notes.
4. `[P4]` Graph/canvas/base views + `obsidian://` "Open in Obsidian" + optional
   REST/MCP bridge.
5. `[P5]` First-party Obsidian plugin; reconciliation pass automation.

## Open design questions (decide before/while building)

- Vector store choice (sqlite-vec vs LanceDB vs in-memory HNSW) + where it lives.
- Editor library (CodeMirror 6 vs Milkdown vs a lighter custom one).
- Is the Brain workspace a **tab** (TerminalTabs) or a **maximized panel**?
- Default trust model: auto-write in the Brain folder, or always diff-approve?
- One global Brain vs per-project Brain by default?
