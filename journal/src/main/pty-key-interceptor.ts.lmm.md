# LMM: src/main/pty-key-interceptor.ts

> File: `src/main/pty-key-interceptor.ts` · LOC: ~120 · Role: Watches PTY stdout for known auth-prompt patterns and fires a `key-prompt` event so the renderer can surface ApiKeyModal.

## Phase 1: RAW

The primary auth path (pre-launch ApiKeyModal in ModelsPanel) handles the case where we know we need a key before spawning. But the user explicitly asked for "Both" — including the case where a CLI is already running and prompts interactively. CLIs like Aider write "Enter your OpenAI API key:" to stdout and read from stdin. Without interception, the user has to stop, set the key in Settings, restart the pane, and re-do whatever they were doing.

The interceptor sits in the data pipeline as a passive listener: pty-registry emits `data` events that already go to the renderer for xterm rendering, and we tap into the same firehose. For panes that aren't attached (Claude, Ollama, or any non-API model), `feed()` is a single Map lookup that returns null — effectively free.

The hard part is **not over-firing**. Auth-prompt regexes are narrow strings ("Enter your <Provider> API key") that won't appear in normal Claude output or in user prose. But they CAN appear if a CLI prints help text — a user typing `aider --help` would emit content that looks identical to a prompt. Mitigation: we only attach the interceptor to panes whose `provider` is known to need a key; Claude/Ollama panes are exempt entirely. That defangs the "help text in Claude pane" case.

ANSI stripping for matching only: the raw bytes still go to xterm untouched. Our regex needs to match clean text without escape sequences interspersed (CLIs often print colored prompts).

The rolling 4 KB buffer per pane is enough for one prompt line + ANSI overhead but doesn't grow unbounded. Once a prompt fires, `promptFired = true` suppresses duplicates until the user submits (interceptor resets) or the pane closes.

## Phase 2: NODES

### Node 1: PROMPT_PATTERNS is a per-provider regex array
Match against any of the patterns for that provider. Why it matters: CLIs sometimes vary their prompt wording across versions. Multiple patterns cover that drift.

### Node 2: Per-pane state with attach/detach lifecycle
Only attached panes are watched. Why it matters: zero cost for panes that don't need this (Claude, Ollama daemon panes), AND avoids the "help text false positive" problem because non-API panes are exempt.

### Node 3: Rolling buffer to span chunked writes
A prompt line might arrive split across multiple `data` events. Without buffering, "Enter your" + " OpenAI API key:" would never match the combined regex. Cap at 4 KB.

### Node 4: `promptFired` flag with explicit reset
Fire once, then suppress until the user submits or the pane closes. Why it matters: a CLI may re-print the prompt rapidly while waiting; we don't want a modal storm.

### Node 5: ANSI stripping for matching, NOT for forwarding
The raw chunk still goes to xterm via the original pty-registry data path. Why it matters: stripping ANSI from displayed bytes would break colored output. We only strip for our regex pass.

### Node 6: `EventEmitter` parent
Standard Node EventEmitter so the IPC bridge in `index.ts` can subscribe with `interceptor.on('key-prompt', …)`. Why it matters: decouples detection from IPC concerns.

## Phase 3: REFLECT

### Core insight
**The interceptor is a tap, not a transform.** It observes the same byte stream xterm sees, never modifies it. The only outbound effect is the IPC event.

### Resolved tensions
- **Node 1 (regex sensitivity) vs Node 2 (attach scoping)**: false positives are theoretically possible if a CLI prints text that matches the prompt regex. We narrow the surface by only attaching for providers that actually need a key. If a Claude session somehow ends up echoing "Enter your OpenAI API key" verbatim, it still won't fire — Claude panes never get the interceptor attached.
- **Node 3 (buffer) vs Node 4 (suppression)**: the buffer is reset only on explicit `resetPromptState` call (after user submits). If a CLI rewrites the prompt (e.g., "Wrong key, try again"), the new prompt should fire — but only after the user dismissed/submitted the first. The reset call from `PROVIDER_KEY_SUBMIT` handles this.

### Hidden assumptions
- Assumed: CLI prompts are written as plaintext to stdout (not via terminfo capabilities or fancy refresh patterns). Challenge: most CLIs do this for legibility, but some (e.g., interactive password prompts via libreadline) may use raw mode. Worst case: our regex misses and the user falls back to setting the key in Settings.
- Assumed: the stripped-ANSI buffer is enough for substring matching. Challenge: CLIs that use cursor movement (CSI G, CSI K) might split a prompt across visual lines without printing a newline — our buffer concatenation still catches it because we don't care about cursor position.
- Assumed: PTY data events arrive in order. Challenge: they do — node-pty is single-stream.

## Phase 4: SYNTHESIZE

### What this file should become
A stable, tap-only observer. The only thing that changes per CLI version is the regex map. New providers add a new entry; new CLI versions of an existing provider may add a new regex to that provider's array.

### Actionable items
- [ ] Add a per-pane TTL on the prompt-fired state so a forgotten-modal scenario doesn't permanently suppress detection.
- [ ] Optional: expose a "disable interception for this pane" IPC so power users can opt out.
- [ ] Add a few more regex variants per provider as we observe real CLI versions.

### Risks
- A CLI version that wraps its prompt in a TUI (full-screen ncurses) might not emit the prompt as detectable bytes. Failure mode: the user sees the modal didn't appear, falls back to Settings. Acceptable.
- The regex map is the only thing standing between detection and silent miss. Document this map's role prominently.
