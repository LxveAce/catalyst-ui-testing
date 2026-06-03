# Agent Coordination Board

> **Purpose:** Catalyst UI is being worked on by **more than one AI agent**
> (and across more than one machine). This file is the shared source of truth
> for *who is doing what, on which branch, and what's done*. **Read this first,
> update it as you go, and commit/push it early** so no two agents collide on
> the same files or duplicate work.
>
> Companion docs: [`STATUS.md`](./STATUS.md) (current product state),
> [`CHANGELOG.md`](../CHANGELOG.md) (shipped history),
> [`BACKLOG.md`](./BACKLOG.md) (open ideas).

Last updated: **2026-06-02**.

---

## Protocol (how we stay in sync)

1. **Before starting work:** `git fetch` all remotes, read this file + `STATUS.md`.
   Check the *Active workstreams* table below for overlap.
2. **Claim your work:** add a row to *Active workstreams* with your agent label,
   branch name, scope, and the files you expect to touch. Commit + push that row
   before you start editing code, so the other agent sees the claim.
3. **One branch per workstream.** Develop on a `feature/*` or `fix/*` branch in
   the **testing** repo (`catalyst-ui-testing`). Never commit directly to
   `master`. Promote testing → public (`catalyst-ui`) only on release.
4. **Avoid file collisions.** If your scope overlaps another open row's files,
   coordinate here first (leave a note in *Decisions / notes*) rather than both
   editing the same file on separate branches.
5. **When done:** flip your row's status to ✅, note the branch/PR, and move the
   goal to *Goals — done*.

Repos: testing = `github.com/LxveAce/catalyst-ui-testing` (work here first) ·
public = `github.com/LxveAce/catalyst-ui` (promote to on release).
Base for all current work: **`master` @ v4.0.3** (`7eb9dd6`).

---

## Active workstreams

| Agent | Branch | Scope | Files (primary) | Status |
|---|---|---|---|---|
| Claude (Opus 4.8, "docs+terminal") | `feature/terminal-profiles-skip-perms` | (1) Launch any system shell (CMD/PowerShell/pwsh/Git Bash/WSL/bash/zsh) as a tab. (2) "Claude (skip permissions)" picker entry → per-launch `--dangerously-skip-permissions`. Plus repo doc sync to Catalyst UI v4.0.3. Adds `PtyRegistry.restart()` (remembers launch params). | `src/main/shell-profiles.ts` (new), `src/main/{index,pty-manager,pty-registry,session-service}.ts`, `src/shared/{types,ipc-channels}.ts`, `src/preload/preload.ts`, `src/declarations.d.ts`, `src/renderer/components/terminal/{TerminalTabs,TerminalPanel}.tsx`, `src/renderer/App.tsx`; docs: README/STATUS/HANDOFF/CHANGELOG/CONTRIBUTING/SECURITY + `security-reviews/SECURITY_REVIEW_TERMINAL_PROFILES.md` | ✅ done + red-teamed. tsc + vite build clean. H-1 fixed. |
| Claude (Opus 4.8, "research+obsidian") | `feature/obsidian-brain` | **Catalyst Brain** = Obsidian-compatible knowledge + AI layer. Deep-research done (25/25 verified). Plan: [`OBSIDIAN_INTEGRATION.md`](./OBSIDIAN_INTEGRATION.md), features: [`OBSIDIAN_BRAIN_FEATURES.md`](./OBSIDIAN_BRAIN_FEATURES.md). | docs: `OBSIDIAN_INTEGRATION.md`, `OBSIDIAN_BRAIN_FEATURES.md`, `BACKLOG.md` | 📋 research/plan complete |
| Claude (Opus 4.8, "build-agent") — handed the build by user | `feature/obsidian-brain` | **P1 — Brain Folder Service** (the substrate): scoped read/write of `.md`+YAML+wikilinks, path-traversal guards, diff-before-write, optimistic-concurrency, atomic writes. | `src/main/brain-service.ts` (new), `src/main/index.ts` (setupBrain), `src/shared/{types,ipc-channels}.ts`, `src/preload/preload.ts`, `src/declarations.d.ts`, `docs/security-reviews/SECURITY_REVIEW_BRAIN_P1.md` (new) | ✅ P1 built + red-teamed. tsc + vite build clean; 15/15 logic tests. No renderer panel yet (P-next). |

---

## Goals

### In progress / claimed
- [ ] **Catalyst Brain — Obsidian integration** (`feature/obsidian-brain`).
  Phase plan in `docs/OBSIDIAN_INTEGRATION.md`. Realizes BACKLOG #4.
  - [x] **P0** naming (Brain vs vault).
  - [x] **P1 — Brain Folder Service** (main): `src/main/brain-service.ts` +
    `setupBrain()` IPC + preload `brain` namespace + `Brain*` types. Scoped
    read/write of `.md`+YAML+wikilinks, path guards, diff-before-write,
    optimistic-concurrency (content hash), atomic writes. Red-team:
    `SECURITY_REVIEW_BRAIN_P1.md`. tsc + vite clean; 15/15 logic tests.
  - [ ] **P-next** (awaiting direction): renderer **Brain panel** (sidebar entry
    + folder picker + note list/read/edit with diff preview) to make P1 usable,
    then **P2** canonical schema + Brain Writer (unify the 7 journaling streams).

### Done
- [x] **Sync stale local clone → Catalyst UI v4.0.3.** Local was at v3.2.0
  "Claude Code Studio"; fast-forwarded to testing/master.
- [x] **Doc sync to the rebrand + 4.0.x.** README, STATUS (full rewrite),
  HANDOFF pointer, CHANGELOG intro, CONTRIBUTING, SECURITY.
- [x] **Feature: system-terminal profiles** in the new-tab picker
  (CMD/PowerShell/pwsh/Git Bash/WSL on Windows; login shell + bash/zsh/fish/sh
  on POSIX). Detected at runtime — only present shells are offered.
- [x] **Feature: "Claude (skip permissions)" picker entry** — per-launch
  `--dangerously-skip-permissions`, OR-combined with the global Settings
  toggle, Claude PTYs only. Tab shows a ⚠ and the choice persists.

---

## Decisions / notes (newest first)

- **2026-06-02** — **User handed the Brain build to the build-agent; P1 shipped on
  the branch.** Brain Folder Service is in (`src/main/brain-service.ts` + IPC +
  preload + types). Dependency-free frontmatter handling (js-yaml is only a
  transitive dep — unsafe to ship from main; raw frontmatter round-trips
  losslessly, light-parse for tags/aliases/title; a real `yaml` dep can come in
  P2). Red-team `SECURITY_REVIEW_BRAIN_P1.md`: one Medium (symlink-escape, same
  lexical-guard limitation as ProjectExplorer — noted for realpath hardening),
  no Highs. Next: a renderer Brain panel to exercise it.
- **2026-06-02** — **"Prepackaged like Ollama" → ship the NATIVE Brain, not the
  Obsidian binary.** User wants Obsidian to feel built-in/prepackaged in the
  `.exe`. Legal way: the Catalyst Brain is native code (compiled into the app,
  reads/writes an Obsidian-*compatible* markdown folder) = zero-install, more
  "prepackaged" than Ollama. **Building agent: do NOT bundle or auto-silent-install
  the Obsidian app** (ToS). Real Obsidian = optional BYO bridge. Full feature +
  UI brainstorm: [`OBSIDIAN_BRAIN_FEATURES.md`](./OBSIDIAN_BRAIN_FEATURES.md).
- **2026-06-02** — **Obsidian: do NOT bundle the binary.** Verified (obsidian.md/terms):
  the desktop app is proprietary closed-source freeware; ToS forbids
  redistribution/derivative-works/RE. "Free for commercial use" (Feb 2025) ≠ free
  to redistribute. So the Ollama-style ship-the-binary pattern is illegal here.
  Legal paths: direct vault filesystem (public formats: `.md`+YAML, MIT JSON
  Canvas `.canvas`, `.base` YAML), `obsidian://` URI, the coddingtonbear Local
  REST API plugin (BYO) + mcp-obsidian, and an optional MIT-typings first-party
  plugin. **Avoid** embedding Obsidian's window (legal grey zone).
- **2026-06-02** — **Naming:** the new Obsidian knowledge/AI layer is **"Catalyst
  Brain"**; the word **"vault"** stays reserved for the existing compact-controller
  `vault-*.json` sync (Phase 6). Don't call the Brain a "vault" in UI/IPC/types.
- **2026-06-02** — Red-team done on the terminal feature (`SECURITY_REVIEW_TERMINAL_PROFILES.md`).
  **H-1 fixed:** restart used to drop a Claude tab's skip-perms flag and respawn
  the bundled Claude on model/shell panes; `PtyRegistry.restart()` now respawns
  with the original launch params + category. tsc + vite build both clean.
- **2026-06-02** — Skip-permissions UX: chosen design is **two picker entries**
  ("Claude" + "Claude (skip permissions) ⚠"), NOT a modal prompt-per-launch.
  Plain `+`/Enter still opens a normal Claude tab.
- **2026-06-02** — Repo is at **v4.0.3**, not 4.0.2 (testing/master `7eb9dd6` is
  two commits past the v4.0.2 tag: the v4.0.3 PTY-resize fix + transfer doc).
- **2026-06-02** — **CHANGELOG has a duplicate `## [4.0.2]` header** (a "second
  hotfix" entry above the "HF deep-iteration" entry). Left as-is pending owner
  decision — don't silently renumber published release history. *Whoever picks
  this up: confirm with the user before merging/relabeling.*
- **Pre-existing latent bug fixed in passing:** `session-service.ts`
  `VALID_PANEL_IDS` was missing `'hf'`, so the HF panel couldn't be the
  restored active panel. Added.

---

## Known environment gotchas (shared)

- **`npm install` required** on a fresh clone — `@huggingface/hub` (v4.0.0 dep)
  isn't in a pre-4.0 `node_modules`; typecheck reports 3 "Cannot find module"
  errors until installed. node-pty rebuild needs VS 2022 C++ Build Tools.
- **Node 22 only** (`engines.node: ">=22.0.0 <24.0.0"`); Node 24 breaks packaging.
- **Local `npm run dist`** needs Windows Developer Mode ON (winCodeSign symlinks).
