# Catalyst UI — Testing

> **Development / testing repository.** This is the staging copy of
> [Catalyst UI](https://github.com/LxveAce/catalyst-ui) (formerly Claude Code
> Studio) used for in-progress work, CDP runtime-verify runs, and pre-release
> validation. The canonical repo, releases, and user-facing docs live in
> **[LxveAce/catalyst-ui](https://github.com/LxveAce/catalyst-ui)** — start
> there if you want the app.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
![Electron](https://img.shields.io/badge/Electron-42-47848F.svg)
![React](https://img.shields.io/badge/React-19-61DAFB.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6.svg)

---

> Provided **as is**, without warranty; you use it at your own risk. See [DISCLAIMER.md](DISCLAIMER.md).

## What this repo is

Catalyst UI is a multi-vendor AI workbench in a single Electron desktop app:
an embedded terminal (node-pty + xterm.js) running the Claude Code CLI,
alongside panels for Hugging Face model discovery, Ollama local models,
multi-provider API keys, GitHub, resource monitoring, cost tracking, an
Obsidian-compatible "Brain" knowledge layer, and more.

**This `-testing` repo holds the same codebase as the main project** and exists
to keep experimental branches, audit harnesses, and verification logs separate
from the release repo. It does not publish its own installers — official builds
are released from [LxveAce/catalyst-ui](https://github.com/LxveAce/catalyst-ui).

- **Install / use the app:** see the
  [canonical repo's releases](https://github.com/LxveAce/catalyst-ui/releases/latest).
- **Read about features and architecture:** see the
  [canonical README](https://github.com/LxveAce/catalyst-ui#readme).

## Running from source

Same toolchain as the main project.

```bash
git clone https://github.com/LxveAce/catalyst-ui-testing.git
cd catalyst-ui-testing
npm install            # runs the node-pty patch postinstall
npm start              # dev: electron-forge + Vite with HMR
```

**Prerequisites**

- **Node.js `>=22.0.0 <24.0.0`** (pinned in `package.json` `engines`; Node 22 LTS).
- On Windows, building the node-pty native module needs Visual Studio Build
  Tools 2022 with the C++ workload and the Windows 10/11 SDK.

Distributable builds use electron-builder (per-OS targets); see the `dist*`
scripts in `package.json`. The dev `start` command still runs through
electron-forge (with the Vite plugin for HMR); the forge Squirrel
`make`/`publish` packaging path is retained only as a legacy escape hatch.

## Tech stack

Electron 42 · React 19 · Vite · TypeScript · node-pty · xterm.js ·
systeminformation · Octokit · @huggingface/hub · electron-builder.

## Layout

```
src/        Application source (main / preload / renderer / shared)
scripts/    Build helpers and CDP audit/verify harnesses
docs/       Handoffs, status, security reviews, release notes
journal/    Per-source-file LMM analyses (one .lmm.md per file)
obsidian-plugin/  First-party Obsidian "Brain" bridge plugin (built separately)
```

## Documentation

- [`CHANGELOG.md`](./CHANGELOG.md) — per-release history
- [`docs/STATUS.md`](./docs/STATUS.md) — current pickup doc
- [`docs/security-reviews/`](./docs/security-reviews/) — per-phase self-red-team reviews
- [`journal/`](./journal/) — per-source-file LMM analyses

## License

[MIT](./LICENSE) © LxveAce

## Connect

- **Discord:** [discord.gg/lxveace](https://discord.gg/lxveace) — questions, help, or to talk through this project
- **GitHub:** [@LxveAce](https://github.com/LxveAce)
- **Website:** [lxveace.com](https://lxveace.com)
