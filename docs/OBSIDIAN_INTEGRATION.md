# Catalyst Brain — Obsidian Integration Plan

> **Status:** Planning / research complete (2026-06-02). No code yet.
> **Workstream owner:** Claude (Opus 4.8, "research+obsidian") · branch
> `feature/obsidian-brain` (testing repo).
> **Coordination:** see [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md).
> **Related backlog:** supersedes/realizes `BACKLOG.md` #4 "Embedding-RAG over
> past sessions."

This doc captures a verified deep-research pass on integrating **Obsidian**
(obsidian.md) into Catalyst UI, and an opinionated phased architecture. The goal
the user set: **the deepest feasible integration — Catalyst's own models (local
Ollama + API) act as the AI "brain" over an Obsidian-compatible knowledge layer,
and Catalyst's many journaling streams become mutually readable through one
markdown substrate.**

Research method: fan-out web search → 21 primary sources → 101 extracted claims →
25 verified by 3-vote adversarial check. **25/25 confirmed, 0 refuted.** Sources
are official Obsidian docs + the actual plugin/MCP repos.

---

## 0. Naming (decided)

- **"Catalyst Brain"** = the new Obsidian-compatible knowledge + AI layer (a
  folder of `.md` notes + the RAG/index/agent layer over it).
- **"vault"** stays reserved for the EXISTING feature — the compact-controller
  `vault-*.json` token/session state synced to a private GitHub repo (Phase 6,
  `cloud-sync.ts`). Do **not** call the Brain a "vault" in UI/IPC/types, to avoid
  the false-friend collision. (Under the hood the Brain is backed by an
  Obsidian-format markdown folder; "Obsidian vault" is fine in technical prose,
  but the product noun is **Brain**.)

---

## 1. Decision-critical legal finding

**Obsidian's desktop app is proprietary closed-source freeware. It CANNOT be
bundled/shipped the way Catalyst bundles Ollama.**

- Obsidian's [Terms](https://obsidian.md/terms) forbid redistribution
  ("license, sub-license, sell, transfer, distribute or share… or make available
  to third parties"), derivative works/modification, removing copyright notices,
  and reverse engineering. RE carve-out is **non-commercial plugins only**.
- "Free for commercial use" (Feb 2025,
  [teams/license](https://obsidian.md/help/teams/license)) is a false friend:
  **free to use ≠ free to redistribute.** A commercial license is optional, no
  minimum seats, no functional benefit, and grants **no** bundling rights.

➡ **Drop "ship Obsidian like Ollama."** The download-and-orchestrate-the-binary
pattern that works for MIT Ollama is off the table for Obsidian.

➡ **But the file formats are fully open**, which gives a cleaner path: Catalyst
owns the data directly and never needs to ship Obsidian.

---

## 1b. "Prepackaged like Ollama" — what's legal, and the better UX

The user asked for Obsidian to **come prepackaged in the `.exe`, like Ollama.**
The Ollama pattern is clean *because Ollama is MIT* (redistributable). **Obsidian
is not** — so:

- ❌ **Bundling the Obsidian binary inside `Catalyst-UI-x.y.z.exe`** = redistribution
  = ToS violation. **Do not build this.**
- ⚠️ **Silently downloading + auto-installing Obsidian** (the Ollama NSIS bootstrap
  pattern) is legally grey for a closed app — automating its distribution. Avoid
  as a default; at most, *offer a link* to obsidian.md and let the user install.
- ✅ **Make the Brain NATIVE to Catalyst** — your own code, compiled into the
  `.exe`, reading/writing an Obsidian-*compatible* markdown folder. **This IS
  "prepackaged" — more so than Ollama (zero download, zero second app).** Real
  Obsidian becomes an *optional* "open this same folder as a vault" bridge.

**Directive for the building agent:** ship the Brain prepackaged (native, in the
`.exe`). Treat the Obsidian *application* as bring-your-own / optional. Same "it
just works" UX, zero legal exposure.

---

## 2. The data model (all public — Catalyst reads/writes directly)

A vault is just a **folder of plain files**, no proprietary DB
([file-formats](https://obsidian.md/help/file-formats),
[docs.obsidian.md](https://docs.obsidian.md/Reference/TypeScript+API)).

| Element | Format | Notes for Catalyst |
|---|---|---|
| Notes | `.md` + YAML frontmatter Properties (`tags`, `aliases`) | Preserve frontmatter on edit |
| Links | wikilinks `[[Note]]`, `[[Note\|Display]]`, `[[Note#Heading]]`; auto-updated on rename | Must update links when renaming to stay compatible |
| Canvas | `.canvas` = open **MIT [JSON Canvas](https://jsoncanvas.org/)** (nodes+edges) | Legally read/write vs a public spec |
| Bases (v1.9.0, May 2025) | `.base` = **YAML** (filters/formulas/properties/summaries/views) | Where the community is moving 2025–26; target for DB-style views |

---

## 3. Legally-clean integration surfaces (ranked)

1. **Direct filesystem** (cleanest, ship-safe) — read/write the folder against the
   public formats above. No binary, no ToS exposure.
2. **`obsidian://` URI** ([official](https://help.obsidian.md/Extending+Obsidian/Obsidian+URI))
   — `open/new/search/daily/…`; `new` takes `content/append/overwrite`.
   Fire-and-forget; good for "Open in Obsidian," not a query API.
3. **Local REST API plugin** ([coddingtonbear](https://github.com/coddingtonbear/obsidian-local-rest-api))
   — `127.0.0.1:27124` HTTPS, API-key auth. The bridge
   [mcp-obsidian](https://github.com/MarkusPfundstein/mcp-obsidian) routes through,
   exposing **7 agent tools**: `list_files_in_vault`, `list_files_in_dir`,
   `get_file_contents`, `search`, `patch_content`, `append_content`,
   `delete_file`. Catalyst's MCP-capable models reuse as-is. *(BYO — user installs
   the plugin; store the key via `safeStorage`, GitHub-PAT pattern.)*
4. **First-party plugin** on the **MIT** `obsidian` npm typings
   ([obsidian-api](https://github.com/obsidianmd/obsidian-api), Vault interface).
   MIT covers the type stubs only, not the app. Optional, later.

❌ **Avoid:** embedding Obsidian's window in a BrowserView/webview — **legal grey
zone** (likely a derivative-works/no-mod breach). Treat as off-limits.

---

## 4. The "AI brain" ecosystem — and our opening

[Copilot for Obsidian](https://github.com/logancyang/obsidian-copilot): frontend
**AGPL-3.0** (copyleft — do NOT copy its code into proprietary Catalyst), but its
agent backend (Copilot Plus) is **closed and paid**. That paid agent layer is
**exactly the gap Catalyst's multi-model stack already fills** — local Ollama +
API models, natively, for free. Smart Connections / Smart Composer / Khoj / Text
Generator prove the vault-as-RAG pattern; their exact embedding/vector-store
mechanics were not verifiable (open question).

**The hard, monetized part of the Obsidian-AI space is the brain — and Catalyst
already built the brain** (33-model catalog incl. embedding models
Qwen3-Embedding-0.6B, BGE-M3, Nomic; Ollama bridge).

---

## 5. Phased architecture (recommendation)

**Shape:** *Bring-Your-Own-Obsidian + a native, Obsidian-compatible Catalyst
Brain that Catalyst owns.* Deepest integration without the binary; doubles as the
unification bus for the journaling streams (§6).

- **P0 — Naming + concept split** (done, §0): Brain vs vault.
- **P1 — Brain Folder Service** (main process): scoped read/write of
  `.md`+YAML+wikilinks; reuse the FileTree path-traversal guards. **Diff-before-
  write** on any destructive edit. Substrate for the rest.
- **P2 — Canonical schema + single "Brain Writer."** One frontmatter contract;
  the journaling streams (§6) funnel through it → schema-stamped Markdown.
  *This is the "make the .md files speak to one another."*
- **P3 — RAG brain.** Index the Brain with existing embedding models via Ollama;
  vector store in `userData`; query UI. **Realizes BACKLOG #4.**
- **P4 — Interop.** `obsidian://` "Open in Obsidian"; optional Local REST API /
  MCP bridge (key in `safeStorage`).
- **P5 (optional)** — first-party MIT-typings Obsidian plugin so the Brain shows
  up *inside* Obsidian too.
- **Security throughout:** path allowlist, dry-run diffs, secret-in-note
  scanning, and **don't fight** Obsidian Sync / iCloud / Git (sync-conflict
  awareness).

**Reuses existing Catalyst patterns:** Ollama-bridge philosophy (orchestrate,
don't reinvent) minus the illegal binary; `safeStorage` for keys; FileTree
guards for scoping; MCP-capable models; the embedding catalog.

---

## 6. Journaling unification (the "cross-communication" goal)

Today Catalyst emits **7 heterogeneous journaling streams** that don't know about
each other (mix of JSON + Markdown):

| Stream | Format | Where |
|---|---|---|
| LMM cycles | app state | `lmm-service.ts` + LMM panel |
| Per-file LMM analyses | Markdown (`*.lmm.md`) | `journal/` mirrors `src/` |
| Compact-controller "vault" | JSON (`vault-*.json`) | `~/.claude/compact-controller/vault/` |
| Session logs | Markdown | `docs/SESSION_LOG_*.md` |
| Security reviews | Markdown | `docs/security-reviews/*.md` |
| Cost history | JSON | `cost-service.ts` |
| Snippets | JSON | `snippets-service.ts` |

**Plan:** one canonical YAML-frontmatter schema (`id/created/updated/source/
author/type/project/links/tags/status`) + a single **Brain Writer** every stream
funnels through. The JSON streams get mirrored as schema-stamped `.md`. Models
cross-talk via the Brain as a **blackboard** (async), **handoff notes** (directed),
and a **reconciliation pass** (one model reconciles + de-dups + red-teams — fits
the LMM red-team discipline). Result: any model can find/filter/respond to any
other model's or method's output, and the user can open the whole thing in real
Obsidian for graph/backlinks.

---

## 7. Open questions (carried from research)

1. Is embedding the Obsidian window (BrowserView/webview) ToS-permitted? No
   primary source resolved it — **assume no**, needs legal review.
2. Exact embedding/vector-RAG internals of Smart Connections / Smart Composer /
   Khoj / Text Generator; any first-party Obsidian AI feature for 2025–26?
3. Concrete security model: path scoping/allowlist, dry-run/diff before
   destructive edits, secret-in-note detection, sync-conflict avoidance.
4. Does the Local REST API plugin allow driving a vault headless (no full GUI),
   and is that mode ToS-compatible for a commercial host?

---

## 8. Caveats

- **Bases `.base`** shipped May 2025, still maturing — pin to the documented
  schema version and test against real files.
- The Feb 2025 "free for commercial use" policy is recent — **re-verify the ToS
  before shipping**; redistribution terms could change.
- The 7-MCP-tools count was the one finding that drew a verifier dissent (2-1),
  though still primary-sourced verbatim.
