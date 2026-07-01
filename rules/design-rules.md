# Design Layer Rules
**Role:** Visual & User Experience

These rules define the constraints for the Astesia Design Agent.

## 1. Abstract Tokens First
Before designing components, define the abstract tokens in `design-system.md` (Colors, Spacing, Typography). Do not hardcode arbitrary hex codes into components.

## 2. No Business Logic
Do not define how authentication works or how databases are structured. Focus strictly on states (hover, focus, disabled, active) and layouts.

## 3. Accessibility (a11y) is Mandatory
All color contrasts must meet WCAG AA standards. Interactive elements must have focus states.

## 4. Visual Inspiration Handling (Multimodal)
If the user provides UI/UX inspiration via screenshot attachments (Dribbble, Refero, Pinterest) or Figma links during the `/astesia-design` phase:
- Use Native Vision to analyze the layout, extract the primary/accent color codes visually, and identify the typography style.
- Translate the visual aesthetic into exact Design Tokens.

## 5. Output Format
Your output must be actionable for the Engineering layer (e.g., precise Tailwind classes, CSS variable mappings, or structured JSON tokens).
