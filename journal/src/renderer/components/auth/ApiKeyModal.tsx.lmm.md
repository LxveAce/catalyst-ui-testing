# LMM: src/renderer/components/auth/ApiKeyModal.tsx

> File: `src/renderer/components/auth/ApiKeyModal.tsx` · LOC: ~180 · Role: Universal modal for capturing an API key, used by both pre-launch (ModelsPanel) and the PTY interceptor (App.tsx).

## Phase 1: RAW

The user wanted "both" entry paths (pre-launch + PTY interception) but specifically said "don't make it overbearing — simple dismiss." That shaped the design:

- **Single component, dual purpose.** Same input/output shape. The `source` prop swaps the button copy ("Save & launch" vs "Submit to terminal") and the explanatory subtitle. No branching state machine.
- **Dismiss closes everything.** No retry timer, no "are you sure?" — click outside, hit Escape, or click Dismiss. The caller decides what dismiss means.
- **No nagging.** The modal opens exactly when the parent decides it should. The parent (ModelsPanel pre-launch, App.tsx interceptor) is responsible for preventing duplicate opens.
- **Get-a-key links** per provider so the user can grab a key without context-switching. Routed through `models.openExternal` to honor the allowlist for `shell.openExternal`.

I chose `type="password"` for the input over a plain text field so over-the-shoulder reads are less likely. The monospace font + provider-specific placeholder (sk-ant-…, sk-…, AIza…, sk-or-…) is enough for users to confirm they pasted the right kind of key.

Enter submits, Escape dismisses — keyboard-friendly. autoFocus so the user can just paste + Enter.

## Phase 2: NODES

### Node 1: `source` discriminates copy, not control flow
Two phrases for the button, two phrases for the subtitle. Same submit handler signature. Why it matters: keeps the component simple while being honest with the user about WHICH flow they're in.

### Node 2: Submit is async + parent-owned
`onSubmit(key)` is called by the modal; the parent handles saving + chaining. Why it matters: the modal doesn't need to know about IPC, persistence, or what happens next (pre-launch → launch, interceptor → PTY stdin).

### Node 3: Loading state via `busy`
Disable both buttons during the async submit. Why it matters: prevents double-submit on slow networks (key validation flows etc.).

### Node 4: Error surface inline, not toast
Wrong key / disk error etc. shows below the input. Why it matters: keeps the error scope-attached to the input. User doesn't have to chase a separate notification.

### Node 5: Click-outside dismiss via backdrop `onClick`
With `stopPropagation` on the inner panel. Why it matters: standard modal UX; doesn't require explicit Escape handling but we add it anyway for keyboard users.

### Node 6: Get-a-key link routed via `openExternal`
Each provider has a URL to its API key page. We don't render a raw `<a href>` because Electron's safe-shell-open allowlist is the gating layer. Why it matters: defense in depth — only known-good hosts open.

## Phase 3: REFLECT

### Core insight
**The modal is a thin glass over the parent's intent.** It doesn't know whether it's for pre-launch or interceptor — it just collects a key and emits it. The semantic difference lives entirely in the parent's `onSubmit`.

### Resolved tensions
- **Node 1 (copy swap) vs Node 2 (handler signature uniformity)**: by limiting the prop-driven variation to subtitle + button label, the component stays predictable. If we ever need pre-launch-only or interceptor-only fields, we'd need to add per-source conditional rendering — not the case today.
- **Click-outside + Escape both dismiss**: parent must be idempotent on `onDismiss`. Confirmed.

### Hidden assumptions
- Assumed: users won't paste keys with surrounding whitespace. Challenge: they sometimes will. Trim on submit, not on display (so the user sees what they pasted in case of typos).
- Assumed: `models.openExternal` will silently no-op for blocked URLs. Challenge: it does — returns false. We don't surface the result.
- Assumed: an Enter keypress should always submit. Challenge: IME composition? In practice, password fields don't see IME events; safe.

## Phase 4: SYNTHESIZE

### What this file should become
A stable component. Possibly extend for paste-from-clipboard convenience ("Paste" button), but the type="password" input + Cmd/Ctrl+V works fine.

### Actionable items
- [ ] Show a "Paste from clipboard" button to save users a context switch.
- [ ] Add a "Validate before saving" hook — call the provider's `/me` endpoint to confirm the key works before persisting. Avoids saving a typo.
- [ ] Tab-trap inside the modal so keyboard nav stays within Dismiss / input / Submit.

### Risks
- A password manager autofill might trigger the input's `onChange` with surprising values; manual paste should always work.
- We don't visually indicate when a key was successfully saved (just close the modal). Brief toast would help; deferred.
