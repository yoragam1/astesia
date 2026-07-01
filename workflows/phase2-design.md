# Phase 2: DESIGN
**Objective:** Define the User Experience and interface specifications.

---

## 1. Load Dependencies

- [ ] Read `.astesia/brd.md` from Phase 1.
- [ ] Verify `astesia-state.json` shows `layer_statuses.product` = `done`.
- [ ] If product layer is NOT done → **HALT**, return to Phase 1.
- [ ] Set `layer_statuses.design` to `in-progress`.

## 2. Abstract Tokenization

- [ ] Do NOT build HTML/React components yet.
- [ ] Map out the design system using `templates/design-system-template.md`:
  - [ ] **Color Palette** — Primary, secondary, accent, neutral, semantic (success/warning/error). Use HSL or CSS custom properties.
  - [ ] **Typography** — Font family, size scale, weight scale, line heights.
  - [ ] **Spacing** — Spacing scale (4px base), border radius, breakpoints.
  - [ ] **Shadows & Effects** — Elevation levels, blur values.
- [ ] If user provides visual inspiration (screenshots, Figma links):
  - Use vision analysis to extract color codes and typography.
  - Translate visual aesthetic into exact Design Tokens (Design Rule #4).
- [ ] All color contrasts MUST meet **WCAG AA** standards (Design Rule #3).

## 3. Component Specs

- [ ] Define interactive element states:
  - [ ] Default, Hover, Focus, Active, Disabled for buttons/inputs.
  - [ ] Loading, Empty, Error states for data-driven components.
- [ ] Define responsive breakpoints: Mobile (< 768px), Tablet (768-1024px), Desktop (> 1024px).
- [ ] List all unique components needed per BRD feature.

## 4. Quality Self-Check

Before handoff, verify:
- [ ] All tokens use CSS custom properties or structured JSON (not hardcoded hex values).
- [ ] Output format is actionable for Engineering (Tailwind config, CSS variables, or JSON tokens).
- [ ] No business logic or database structure in the design specs.
- [ ] All interactive elements have focus states defined (a11y).

## 5. Handoff

- [ ] Save design system as `.astesia/design-system.md`.
- [ ] Update `astesia-state.json`:
  - Set `layer_statuses.design` to `done`.
  - Set `current_layer` to `engineering`.
  - Add history entry.
- [ ] Inform the user of the transition to Engineering.

## Fail Conditions (HALT Pipeline)

- ❌ BRD does not exist or is incomplete → **HALT**, return to Product Layer.
- ❌ Color contrast fails WCAG AA → **Fix before handoff**.
- ❌ User provides no design direction AND no visual inspiration → **Ask** for at least a style preference (minimal/playful/corporate/etc).

## Expected Output

```
.astesia/
├── design-system.md       # Complete design tokens & component specs
└── astesia-state.json     # Updated: current_layer = "engineering"
```
