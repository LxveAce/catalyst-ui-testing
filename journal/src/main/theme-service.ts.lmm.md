# LMM: src/main/theme-service.ts

> File: `src/main/theme-service.ts` · LOC: ~120 · Role: Persist user-defined accent themes to `<userData>/themes.json`; expose list/save/delete.

## Phase 1: RAW

The renderer's `theme-presets.ts` ships 13 built-in accent presets that get applied via CSS custom properties. Cat 4 of the R&D push asked for a "theme editor" — the ability to build and save custom accent themes that persist across restarts. The 6 fields per theme (accent, accentLight, gradient, gradientSoft, borderActive, glow) all derive from a single hex color plus an optional light-anchor, so the editor's UI only takes the two anchor hexes and the renderer derives the rest via `deriveThemeFromAccent`.

The service follows the same pattern as `NotificationsService` / `SnippetsService`: JSON file under `app.getPath('userData')`, atomic write via tmp + rename, defaults-on-error read. The novelty is validation — these themes get applied to CSS variables, so an attacker who controlled the file could try to inject arbitrary CSS via the `gradient` field (it's a string interpolated into a `linear-gradient(…)` expression). I cap length and trust the renderer's deriveThemeFromAccent to produce safe values for new themes; old/manually-edited files get length-bounded but not fully sanitized.

What scares me: the gradient/gradientSoft fields accept any string up to 200 chars. A user editing the JSON directly could write `red); -webkit-filter: blur(50px); background: url(…` which would inject arbitrary CSS. Mitigation: keep length tight, document that direct edits are unsafe, and rely on the editor to always go through `deriveThemeFromAccent`.

The MAX_THEMES = 64 cap keeps the file bounded; the NAME_MAX = 40 prevents pathological names. Custom themes don't collide with built-ins because the renderer namespaces them with a `custom:` prefix in localStorage.

### Open questions
- Should we add CSS sanitization on the gradient field beyond length cap?
- Is 64 the right ceiling? Could be 32 or 128 — picked arbitrary.

## Phase 2: NODES

### Node 1: Validation lives in the service, not the IPC handler
`validate()` is called on both read and write paths so malformed entries are dropped on load. Why it matters: future direct file edits can't poison the in-memory list.

### Node 2: Atomic write via tmp + rename
Same pattern as `NotificationsService`. Why it matters: rename is atomic; a crash mid-write leaves the previous file intact.

### Node 3: No `custom:` prefix in stored data
Themes are stored without the prefix. The prefix only exists in the renderer's localStorage key. Why it matters: keeps the service unaware of how the renderer disambiguates built-ins vs customs.

### Node 4: `read()` returns `[]` on any error
Including JSON parse failure. Why it matters: never crashes on first launch when the file is missing. Trade-off: a corrupted file silently loses all themes.

### Node 5: Save = remove-then-append by name
Re-saving an existing name updates it (idempotent). Why it matters: matches editor UX where editing an existing theme should overwrite.

## Phase 3: REFLECT

### Core insight
This is a **typed JSON store with a length-bounded schema**. The risk surface is CSS injection via the gradient string fields, mitigated but not eliminated by length caps.

### Resolved tensions
- **Node 1 vs Node 4**: validation drops malformed entries but `read()` silently swallows parse errors. The renderer can't tell the difference between "empty store" and "corrupted store." Acceptable for v1.

### Hidden assumptions
- Assumed: users won't hand-edit `themes.json`. Challenge: power users might. The length cap on gradient/gradientSoft is the only real defense.
- Assumed: built-in themes never collide with custom names. Challenge: the renderer concatenates `[...THEME_PRESETS, ...customThemes]` for display — a user-named "Purple" custom would shadow the built-in Purple in the keyed grid. Mitigation: built-in lookup is exact-string, custom lookup is prefixed.

## Phase 4: SYNTHESIZE

### What this file should become
A focused, length-validated JSON store. Stays small. Future versions could add a `version` field for forward-compat or a `derivedFromAccent: '#xxxxxx'` field so the editor can re-open a custom theme with just the anchor color (rebuilding gradient/glow fresh).

### Actionable items
- [ ] Add CSS-pattern allowlist on `gradient` / `gradientSoft` (e.g. regex requiring `linear-gradient(...)` opening).
- [ ] Store `derivedFromAccent` so the editor can round-trip.
- [ ] Add `version: 1` to the store for forward compat.

### Risks
- Direct file edits could inject arbitrary CSS into the running app. Length caps are the only safety net.
- The 64-theme cap is arbitrary — power users may want more.
