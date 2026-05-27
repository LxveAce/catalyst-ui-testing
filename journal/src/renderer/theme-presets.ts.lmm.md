# LMM: src/renderer/theme-presets.ts

> File: `src/renderer/theme-presets.ts` · LOC: ~190 · Role: Built-in accent presets + theme-application via CSS variables + helpers for custom-theme derivation and key parsing.

## Phase 1: RAW

This file existed before Cat 4 with 6 curated presets. The R&D scope asked for "more choice to the themes and editing of such," which meant two distinct extensions:
1. **More built-ins**: I added 7 more presets (Slate, Indigo, Crimson, Forest, Magenta, Midnight, Solarized) — 13 total. Curated rather than algorithmically generated because the 7-color tail in the existing 6 (gradient + glow + border + soft-gradient) was clearly hand-tuned; algorithmic derivation across the board would lose that taste.
2. **Custom theme support**: needed an additive `custom` boolean on `ThemePreset`, a `deriveThemeFromAccent()` helper for the editor (so the user picks 2 colors and gets all 6 fields), and an `applyTheme` change that prefixes localStorage with `custom:` for custom themes.

The trickiest piece is the **persistence key disambiguation**. Built-in lookup is by exact name. Custom lookup is by name within a separate list loaded async via IPC. If both share localStorage, the renderer needs to know which list to look in. I picked a `custom:` prefix in localStorage rather than a parallel "is the active theme custom?" boolean because the key alone is enough — no chance of the two state pieces drifting apart.

`deriveThemeFromAccent` does light/dark mixing via straight RGB interpolation toward white/black. That's not perceptually uniform (would need OKLab for that), but it produces results visually consistent with the hand-tuned built-ins. The light anchor defaults to "accent mixed 40% toward white"; user can override via the editor's second color picker.

## Phase 2: NODES

### Node 1: `custom?: boolean` discriminator
Optional field on `ThemePreset`. Default undefined = built-in. Why it matters: lets a single type cover both built-ins and customs without subclassing.

### Node 2: `custom:` prefix in localStorage
Stored as `custom:MyTheme` for customs, `Purple` for built-ins. Why it matters: the renderer reads localStorage *before* the IPC theme list has loaded (no async on initial paint). Prefix lets us defer the lookup but still know "this needs custom resolution."

### Node 3: `findThemePreset` returns undefined for `custom:` keys
Even when called with the full stored key including prefix. Why it matters: forces callers to use `parseThemeKey` + the async custom-list lookup. Wrong-call site at least fails predictably.

### Node 4: `deriveThemeFromAccent` derives 4 fields from 1-2 hexes
Gradient mid/deep stops via straight RGB darken. Soft-gradient via `rgba()`. Border-active via `rgba(…, 0.3)`. Glow via `rgba(…, 0.15)`. Why it matters: editor UX stays minimal — 2 color pickers, not 6.

### Node 5: `parseThemeKey` returns `{ custom, name } | null`
Single function for "is this a custom or built-in?" Why it matters: every caller would otherwise duplicate the `startsWith('custom:')` check.

### Node 6: `hexToRgb` / `lighten` / `darken` are local
Not exported. Why it matters: encapsulation — keep the color math as implementation detail. If a caller needs them later, lift to a util module.

## Phase 3: REFLECT

### Core insight
**Themes are the public contract; persistence keys are an internal disambiguator.** The `custom:` prefix is plumbing that should never appear in user-facing UI strings.

### Resolved tensions
- **Node 2 vs Node 3**: the prefix-in-localStorage means `findThemePreset(stored)` would always miss for customs. Solved by making `findThemePreset` explicitly bail on `custom:` keys, and exposing `parseThemeKey` as the disambiguator. Callers must use both.
- **Built-ins + customs in one rendered grid**: SettingsPanel iterates `[...THEME_PRESETS, ...customThemes.map(t => ({...t, custom: true}))]`. The injected `custom: true` is consistent with what `deriveThemeFromAccent` produces. If a future change ever lets a built-in have `custom: true`, the key disambiguation breaks. Invariant: built-ins are NEVER marked custom.

### Hidden assumptions
- Assumed: `localStorage` is durable enough for theme preference. Challenge: cleared by user / Chromium profile wipe loses the preference. Acceptable — defaults are fine on reset.
- Assumed: `applyTheme` running before the custom list is hydrated is OK because of the early-bail. Challenge: there's a brief window where the user's custom theme is active in storage but the renderer is using defaults until App.tsx's async hydrate completes. Acceptable for v1; an FOUC-style flash on every startup would be the user-visible symptom.

## Phase 4: SYNTHESIZE

### What this file should become
Stable surface. Built-ins grow occasionally; helpers stay tight. If we ever add light themes (currently all are dark-mode accents), `ThemePreset` needs a `mode: 'dark' | 'light'` discriminator and `applyTheme` needs to set more variables — bigger change.

### Actionable items
- [ ] Move `applyTheme`'s localStorage write into the calling component rather than the function itself — currently the side effect is buried inside what looks like a pure-CSS function.
- [ ] Consider OKLab interpolation for `deriveThemeFromAccent` if users complain about derived gradients looking off.
- [ ] Document the `custom:` prefix invariant in a comment block at the top.

### Risks
- Renaming a built-in preset breaks every user who had it active (their localStorage points at a now-missing name). Don't rename.
- If someone adds a built-in with a name that exactly matches one of their custom themes, the customs list shadowing happens visually (both render in the grid). Mitigation: rare in practice; the keyed iteration uses prefixed keys so React doesn't error.
