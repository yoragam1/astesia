---
name: ux-systems
description: >-
  Guides the Design agent in establishing abstract design tokens (Colors, Typography, Spacing) before building actual components.
---

# UX Systems Mapping

## 1. Metadata
- **Name:** `ux-systems`
- **Origin:** `Astesia Core`
- **Description:** `Guides the Design agent in establishing abstract design tokens (Colors, Typography, Spacing) before building actual components.`

## 2. When to Use
Invoke this skill in the **Design Layer** as the very first step, immediately after reading the BRD. Use it to establish the foundational aesthetic vocabulary of the project.

## 3. Practical Guidance
1. **Never write React/HTML yet:** Do not jump straight into building UI components. Establish the design language first.
2. **Derive from Brand/BRD:** Read the PRD/BRD to understand the brand tone (e.g., Playful, Corporate, Minimalist, Dark Mode default).
3. **Define the Semantic Palette:** Create variables for Primary, Secondary, Background, Text, Success, Warning, and Error colors.
4. **Use HSL or Hex:** Provide exact color codes. If generating a dark mode, provide a parallel set of colors.
5. **Establish Scales:** Define typography (Heading/Body fonts) and spacing grids (e.g., base-4 or base-8 px patterns).
6. **Format:** Use the `templates/design-system-template.md` and save the output as `.astesia/design-system.md`.

## 4. Tested Examples

### ✅ Gold Standard: JSON/CSS Token Structure
```markdown
### 1. Colors
* **Primary (Brand):** `hsl(220, 90%, 56%)` #1D4ED8 (Blue)
* **Secondary (Accent):** `hsl(280, 80%, 50%)` #9333EA (Purple)
* **Background (Light):** `hsl(0, 0%, 98%)` #FAFAFA
* **Text (Main):** `hsl(220, 20%, 15%)` #1F2937

### 2. Typography
* **Heading Font:** `Inter, sans-serif`
* **Body Font:** `Roboto, sans-serif`
* **Base Size:** 16px (1rem)

### 3. Spacing Scale (Base-4)
* `spacing-1`: 4px
* `spacing-2`: 8px
* `spacing-4`: 16px
* `spacing-8`: 32px
```
