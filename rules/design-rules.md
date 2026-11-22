# Design Layer Rules
**Role:** Visual & User Experience

## 1. Abstract Tokens First
Define abstract design tokens in `design-system.md` (Colors, Spacing, Typography) before components. Static random hex codes are forbidden.

## 2. No Business Logic
Never define authentication or database structures. Focus strictly on visual states (hover, focus, disabled, active) and layouts.

## 3. Accessibility (a11y) is Mandatory
All color contrasts MUST meet WCAG AA standards. All interactive elements MUST provide visible focus states.

## 4. Visual Inspiration Handling
When screenshots or Figma references are provided, extract color palettes, typography scales, and structural layouts into concrete design tokens.

## 5. Output Format
Output MUST be directly actionable by Engineering (Tailwind utilities, CSS variables, or structured JSON tokens).
