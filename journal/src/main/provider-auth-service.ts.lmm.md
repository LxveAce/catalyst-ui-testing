# LMM: src/main/provider-auth-service.ts

> File: `src/main/provider-auth-service.ts` · LOC: ~190 · Role: Per-provider API key store using Electron safeStorage; computes env vars for PTY injection.

## Phase 1: RAW

Cat 5 of the R&D push asked for a "universal API-key UI" that supports multi-provider CLI launches without re-prompting the user every time. The shape that fell out: a small, main-process-only secret store, IPC-callable via boolean-only / presence-only methods (raw keys never cross IPC), with `envForProvider()` as the bridge to PTY spawning.

The key safety invariants:
1. **Raw keys never leave the main process.** Renderer can call `setKey` (passes the secret IN) but can't call any method that returns the secret. `hasKey` returns a boolean; `list` returns presence + timestamps.
2. **Use safeStorage when available, refuse plaintext by default.** Same defense as `auth-service.ts` and `github-service.ts`. Power users can override with `allowPlaintext: true` — but the IPC layer never exposes that flag.
3. **Singleton** to avoid multiple instances writing the file concurrently.

The `normalizeProvider` mapping is doing real work — model definitions in the catalog use display names ("Anthropic", "Google", "OpenAI", "OpenRouter") while the auth store uses canonical ids. We can't trust the display name to be exact across catalog edits. Single function, four cases, fail closed on unknown.

`PROVIDER_ENV_KEY` is the contract with the spawned CLI. If the CLI's env var convention changes, this map updates. Each entry is a documented one-liner.

## Phase 2: NODES

### Node 1: Raw-key methods are not exposed via IPC
`getRawKey` is `public` (needs to be callable from `index.ts` at PTY spawn time) but the only IPC handlers expose `hasKey`, `setKey`, `list`, `delete`. Why it matters: defense in depth — even a buggy preload couldn't accidentally leak the key to renderer.

### Node 2: Singleton via static instance
Same pattern as `OllamaService`, `ModelRegistry`. Why it matters: single writer to `provider-auth.json`. No concurrent-write races.

### Node 3: safeStorage with explicit opt-in for plaintext
Defaults to encrypted; throws on missing keychain. Why it matters: keys on disk in plaintext are an audit-trail nightmare. Force the user to acknowledge.

### Node 4: `envForProvider` returns the actual env var the CLI expects
Not a generic K/V — knows that Anthropic reads `ANTHROPIC_API_KEY`, OpenAI reads `OPENAI_API_KEY`, etc. Why it matters: keeps the per-provider knowledge in one file. Callers (index.ts MODELS_LAUNCH) don't need to know which env var goes with which provider.

### Node 5: `normalizeProvider` maps display → canonical
Lowercases, accepts "google" as a synonym for "gemini" (Google AI Studio brand). Why it matters: catalog display names are user-facing; canonical ids are stable.

### Node 6: KNOWN_PROVIDERS is closed
Only the 4 canonical ids are valid. Why it matters: an attacker who controls a model's `provider` field can't store keys under arbitrary names that might collide with other JSON paths. Trade-off: custom providers (later R&D) will need to extend this list.

### Node 7: Read-then-write keeps unknown fields
Actually no — we filter to KNOWN_PROVIDERS on read. A direct file edit adding a 5th provider gets silently dropped on next save. Why it matters: file-format invariant is enforced. Trade-off: extending requires a code change, not a JSON edit.

## Phase 3: REFLECT

### Core insight
**Raw keys are radioactive — they live in main only and only escape as env vars on a PTY we control.** Every other surface (renderer IPC, file dump, log line) gets booleans or timestamps.

### Resolved tensions
- **Node 1 vs Node 4**: `getRawKey` and `envForProvider` both need internal-only access to the raw key. `envForProvider` is the public-API name; `getRawKey` is the lower-level building block. Both are public on the class but neither is called via IPC. The IPC layer in `setupProviderAuth()` is the only renderer-reachable surface, and it doesn't expose either method.
- **Node 3 vs Node 6**: refusing plaintext + closed provider list. If a user is on a system where safeStorage doesn't work (headless Linux, kiosk mode), they can't save keys at all. Mitigation: surface a clear error in the modal; document the workaround as setting env vars at shell level.

### Hidden assumptions
- Assumed: `safeStorage.isEncryptionAvailable()` is honest. Challenge: on Linux GNOME, it's only available with a logged-in keyring session — under SSH/screen, may report unavailable. Acceptable — those users typically run CLIs directly with env vars set, not via the GUI.
- Assumed: a key is opaque to us. Challenge: we don't validate format (sk-ant-… vs sk-…). The CLI will error if the key is wrong. Mitigation: placeholder hints in the modal suggest the right shape per provider.
- Assumed: deleting a key revokes future env injection but doesn't kill running PTYs. Challenge: a long-running CLI that already received the env continues to use it. Documented behavior — user can `kill` the pane and relaunch.

## Phase 4: SYNTHESIZE

### What this file should become
A small, focused, main-only secret store. Don't add fancy features — no rotation timers, no expiration, no remote sync. Those expand the attack surface for marginal benefit.

### Actionable items
- [ ] Add a `lastUsed` timestamp on each entry (set by `getRawKey`) so the UI can show "used 2h ago" — helps users find stale keys.
- [ ] Consider key shape validation per provider (sk-ant-…, sk-…, AIza…) to give early feedback on typos. Trade-off: brittle if providers change their format.
- [ ] Open the provider catalog to user-defined entries — would need `custom:<id>` in `ProviderId`, and the store schema needs to widen accordingly.

### Risks
- Linux/Wayland safeStorage flakiness can lock users out of saving keys. Surface a clear error path.
- The `setupProviderAuth` IPC handlers accept `provider` as `string` — if the renderer passes a typo, the handler currently silently treats it as the typo (cast-to-never trick). Tighten the validation if abuse becomes an issue.
