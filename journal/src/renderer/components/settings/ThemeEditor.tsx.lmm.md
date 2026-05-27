# LMM: src/renderer/components/settings/ThemeEditor.tsx

> File: `src/renderer/components/settings/ThemeEditor.tsx` · LOC: ~280 · Role: Modal UI for creating / editing / deleting custom accent themes; lives in Settings → Appearance.

## Phase 1: RAW

Cat 4 of the R&D push asked for a theme editor that lets the user build custom accent themes from color anchors. The hardest design call was **live preview semantics**: do you (a) preview only in a small swatch inside the modal, or (b) apply the in-progress theme to the entire app chrome so the user can see "what would this look like on the real surfaces?"

I picked (b) for the UX win — but it required two pieces of bookkeeping:
1. On modal open, snapshot the currently-active theme (`editorRestoreTheme` in SettingsPanel) so we can revert if the user dismisses without saving.
2. On modal unmount, restore that snapshot. Save flow doesn't restore — it commits the new theme as active.

This is the "modal mutates global state, must be reversible on dismiss" pattern. The component owns nothing — it's a controlled view that emits intent events (`onLivePreview`, `onSaveAndApply`, `onDelete`, `onRestoreActiveTheme`, `onClose`) and SettingsPanel does the actual state changes. That keeps the modal trivially testable / re-mountable.

The two-color editing model (accent + accent-light) plus `deriveThemeFromAccent` from theme-presets gives the user fine control without overwhelming them. Power users who want explicit gradient stops will have to extend `deriveThemeFromAccent` or hand-edit `themes.json`.

The validation happens twice: client-side here (with friendly error UI) and again in `ThemeService.validate()` on the main side. Belt-and-suspenders is correct because the main-side validation has to defend against direct JSON edits.

## Phase 2: NODES

### Node 1: Controlled, side-effect-free component
Props are inputs and event handlers; component owns no global state. Why it matters: parent decides what "save" means (it might apply, navigate away, or just persist).

### Node 2: Live preview via `onLivePreview` callback
Pushes the derived theme to the parent on every input change. Why it matters: the user sees their work on the actual app chrome, not just a swatch.

### Node 3: Restore on unmount via cleanup ref
`useEffect(() => () => onRestoreActiveTheme(), [])`. Why it matters: covers both close-button dismiss and click-outside-to-dismiss.

### Node 4: Validation duplicated client + server
Length + hex regex on both sides. Why it matters: client-side gives instant feedback, server-side defends against poisoned files.

### Node 5: Click-outside dismiss via backdrop `onClick`
With `stopPropagation` on the inner panel. Why it matters: standard modal UX; doesn't require Escape handling.

### Node 6: "Edit existing" reuses the form
Clicking a saved custom theme name populates the editor inputs. Save with the same name overwrites (idempotent in ThemeService). Why it matters: one editor surface for both create and update flows.

### Node 7: Inline styles, no CSS classes
Matches the rest of the codebase's settings UI. Why it matters: keeps the file self-contained and avoids touching globals.css.

## Phase 3: REFLECT

### Core insight
**The hard part isn't editing colors — it's the reversible side effect on dismiss.** Live preview mutates global CSS variables, so the modal owns a commit/rollback obligation.

### Resolved tensions
- **Node 2 vs Node 3**: if `onLivePreview` is called continuously on input change AND `onRestoreActiveTheme` runs on unmount, the parent needs to apply the snapshot in `onRestoreActiveTheme`. SettingsPanel does this — passing `() => editorRestoreTheme && applyTheme(editorRestoreTheme)` as the callback. Coupling is explicit in the prop contract.
- **Node 5 vs Node 3**: click-outside dismiss is fast and the unmount cleanup fires automatically. No special-cased "did the user dismiss vs save?" branching needed — save unmounts via `setEditorOpen(false)` too.

### Hidden assumptions
- Assumed: HTML `<input type="color">` works on Electron/Chromium. Challenge: it does, and it's native-feeling. Linux users may see a slightly different picker; acceptable.
- Assumed: users won't paste arbitrary text into the hex inputs. Challenge: they might. Validation catches bad input before save, but live preview can render with an invalid hex (which `hexToRgb` will parse as NaN — RGB string becomes `"NaN,NaN,NaN"`). Browser ignores invalid CSS — fails silent + ugly until the user corrects. Acceptable for v1.

## Phase 4: SYNTHESIZE

### What this file should become
A stable modal. Future enhancements: a "duplicate built-in to customize" button (right now you can only edit existing customs, not fork a built-in). Possibly an OKLab color picker if RGB feels limiting.

### Actionable items
- [ ] "Duplicate from built-in" button — copies a preset's accent/accentLight into the editor for the user to tweak.
- [ ] Show derived preview values (gradient stops, glow color) somewhere so users understand what they're getting beyond the two anchors.
- [ ] Validate hex on input blur, not just on save — surface "invalid hex" instantly.

### Risks
- Live preview FOUC on rapid color picker drag — every change fires `applyTheme` which writes 9 CSS variables. Likely fine; profile if it lags.
- The Escape-key dismiss isn't wired. Click-outside is. Common modal pattern is both; add if needed.
