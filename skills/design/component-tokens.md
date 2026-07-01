# Component Tokens

## 1. Metadata
- **Name:** `component-tokens`
- **Origin:** `Astesia Core`
- **Description:** `Guides the Design agent in mapping abstract UX systems into actionable component specifications and interaction states.`

## 2. When to Use
Invoke this skill in the **Design Layer** after `ux-systems` has been defined. Use it to specify how individual UI components (buttons, inputs, cards) behave and look using the established tokens.

## 3. Practical Guidance
1. **Avoid Hardcoding:** Never specify arbitrary hex strings in component definitions. Always reference the tokens established in `ux-systems` (e.g., use `Primary-Color` instead of `#1D4ED8`).
2. **Define Interactive States:** A component is not a static image. You must define its appearance in various states: `Default`, `Hover`, `Focus` (mandatory for accessibility), `Active` (pressed), and `Disabled`.
3. **Map to CSS/Tailwind:** Structure the output so that it is easily translatable by the Engineering Layer into CSS classes or Tailwind utilities.
4. **Output:** Append these definitions directly into the `components` section of `.astesia/design-system.md`.

## 4. Tested Examples

### ❌ Anti-Pattern: Hardcoded & Static
```markdown
* **Button:** Blue background (#0000FF), white text. Rounded corners 5px.
```

### ✅ Gold Standard: Tokenized & Stateful
```markdown
### Component: Primary Button
* **Base Tokens:** `bg-primary`, `text-background`, `rounded-md`, `px-4 py-2`
* **States:**
  * **Default:** Opacity 100%.
  * **Hover:** Darken background by 10% (e.g., `bg-primary-dark` or `hover:brightness-90`).
  * **Focus:** Add a 2px outline using the `accent` color with a 2px offset (`focus:ring-2 focus:ring-accent focus:ring-offset-2`).
  * **Active:** Scale down slightly (`active:scale-95`).
  * **Disabled:** Opacity 50%, cursor-not-allowed, maintain default background.
```
