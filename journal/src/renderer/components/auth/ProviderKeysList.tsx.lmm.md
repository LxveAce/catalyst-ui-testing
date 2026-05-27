# LMM: src/renderer/components/auth/ProviderKeysList.tsx

> File: `src/renderer/components/auth/ProviderKeysList.tsx` · LOC: ~140 · Role: Settings → API keys list with per-provider Set/Replace/Delete buttons; opens ApiKeyModal for the edit flow.

## Phase 1: RAW

This is the "explicitly manage your keys in Settings" surface. Cat 5 emphasized "don't be overbearing" on the pre-launch flow, which means most users should never see the pre-launch modal twice. But for the cases where they DO want to swap a key, revoke one, or pre-emptively set keys before they launch any models, Settings is the home.

The component is intentionally flat — one row per known provider, all four always shown (anthropic / openai / gemini / openrouter), regardless of whether a key is set. This makes the surface predictable: a user looking for "where do I set my OpenAI key?" sees it immediately even if no key is on file yet. The alternative — only showing providers with keys + a separate "Add provider" button — would be more keystrokes and surprise empty states.

`PROVIDER_BLURB` keys hint at the practical use of each — Anthropic's blurb mentions the OAuth fallback (since Claude CLI has both auth paths), OpenAI's mentions Aider + OpenRouter (since OpenAI lacks an official CLI), etc.

Relative-time display ("set 2h ago", "set 3d ago") matches the convention from other settings rows. The actual implementation is a small `formatRelative` helper at the bottom of the file — not shared anywhere else, no need to factor out.

## Phase 2: NODES

### Node 1: Always show all 4 known providers
Even if no key is set. Why it matters: predictable surface; "where do I set X?" never requires hunting.

### Node 2: Blurb per provider
One short line explaining what's actually using this key. Why it matters: users may not know that "OpenAI" means "for Aider/OpenRouter use" rather than a dedicated OpenAI CLI.

### Node 3: Edit/Replace via the same ApiKeyModal
`setKey` is the only verb (which overwrites if already set). Why it matters: one modal, one mental model.

### Node 4: Delete is destructive, no confirm
We don't show a "Are you sure?" because the cost of accidentally clicking × is recoverable: the user re-enters the key. Why it matters: minimal friction; trade-off accepted.

### Node 5: Error state inline above the list
Same shape as other settings sections. Why it matters: consistency with the rest of SettingsPanel.

### Node 6: `refresh()` returns the new list from the IPC roundtrip
The IPC handlers return the post-mutation state, so we don't need a separate `list()` call after `setKey`/`delete`. Why it matters: one network round-trip per action.

## Phase 3: REFLECT

### Core insight
**Settings is the "I want to manage my keys" surface.** Pre-launch + interceptor are the "the system asked me for this" surfaces. Both feed the same store; the UI shape diverges to match the user intent.

### Resolved tensions
- **Node 1 (always show all) vs future custom providers**: if Cat 6 introduces custom provider entries, the "list all 4" expands. We'll need to compose the list from a known-providers source. For now, hardcoded list of 4 matches the store's KNOWN_PROVIDERS.
- **Node 4 (no delete-confirm) vs accidental clicks**: × button is small enough that mis-clicks are uncommon. If users complain, add a hover-time delay or two-stage confirm.

### Hidden assumptions
- Assumed: the IPC `list()` is fast (synchronous file read). Challenge: it is. No spinner needed.
- Assumed: relative-time format is acceptable for all locales. Challenge: en-US-centric. Acceptable for v1; i18n is a bigger project.

## Phase 4: SYNTHESIZE

### What this file should become
A stable list. Grows by 1 row per new provider as the abstraction widens. Possibly add a "Test key" button per row that calls a `/me` endpoint to verify the saved key still works.

### Actionable items
- [ ] "Test key" button per provider — calls the provider's whoami endpoint to confirm liveness.
- [ ] Inline "Show last 4 chars" for confirmation that the saved key matches the user's expectation.
- [ ] Hover state on × that delays delete until a 300ms-hold or second click.

### Risks
- Deleting a key while a running PTY is using its env vars doesn't affect that PTY (env was set at spawn). Document this in the blurb if users find it surprising.
