---
name: visual-qa
description: >-
  Protocol for auditing UI implementations against design specs, catching visual regressions, and verifying user flows in the browser. Incorporates Headless Browser Automation (Visual Auditing) for autonomous DOM inspection.
---

# Skill: Visual QA & UI Testing Protocol

## 1. Metadata
- **Name:** `visual-qa`
- **Origin:** `Astesia Core`
- **Description:** Protocol for auditing UI implementations against design specs, catching visual regressions, and verifying user flows in the browser. Incorporates Headless Browser Automation (Visual Auditing) for autonomous DOM inspection.

## 2. When to Use
Invoke this skill when:
- The Engineering Layer has completed a frontend implementation.
- User reports a visual bug or layout misalignment.
- Verifying that a design system spec is correctly implemented in code.
- The BRD mentions user flows that need end-to-end validation.

## 3. Visual QA Checklist

### Level 1: Design Spec Compliance
Compare the implementation against `.astesia/design-system.md`:
- [ ] Color palette matches the spec (primary, secondary, accent, error, success).
- [ ] Typography scale is correct (font family, sizes, weights for H1–H6, body, caption).
- [ ] Spacing system is consistent (margin/padding uses design tokens, not arbitrary px values).
- [ ] Component states are implemented (hover, focus, active, disabled, loading, error).
- [ ] Responsive breakpoints match the spec (mobile, tablet, desktop).

### Level 2: User Flow Verification
For each Critical User Journey (CUJ) in the BRD:
- [ ] The happy path works end-to-end without errors.
- [ ] Form validation shows appropriate error messages.
- [ ] Loading states are visible (spinner, skeleton, etc.).
- [ ] Success states are visible (confirmation, redirect).
- [ ] Error states are handled gracefully (no raw API errors shown to user).

### Level 3: Accessibility Baseline
- [ ] All interactive elements are keyboard-navigable (Tab, Enter, Escape).
- [ ] Images have `alt` attributes.
- [ ] Form inputs have associated `<label>` elements.
- [ ] Color contrast meets WCAG AA (4.5:1 for normal text, 3:1 for large text).
- [ ] No content relies solely on color to convey meaning.

### Level 4: Performance
- [ ] No layout shift (CLS) on page load.
- [ ] Images are optimized (WebP, lazy loading, proper dimensions).
- [ ] No unnecessary re-renders on state changes.
- [ ] Network requests are batched where possible.

## 4. Browser Interaction Patterns

### Structured Visual Audit Flow (Manual)
When performing a visual audit manually:

```
Step 1: Navigate to the URL/page
Step 2: Take a screenshot and compare against design-system.md
Step 3: Check browser console for JS errors
Step 4: Click through each CUJ flow
Step 5: Resize to mobile breakpoint (375px) and verify responsive layout
Step 6: Check keyboard navigation
Step 7: Document findings as a defect list
```

### Automated Visual Auditing (Headless Browser)
To operate as an overpowered autonomous agent, do NOT rely purely on human verification.
1. Use Antigravity's native `visual_audit` tool or execute a temporary Puppeteer/Playwright script to launch a headless browser against the local dev server.
2. The script must capture:
   - DOM Snapshots (to verify CSS classes and layout structure).
   - Console Error Logs (intercept `page.on('console')`).
   - Screenshots of key states (mobile and desktop).
3. Compare the extracted DOM styles programmatically against the `design-system.md` tokens. Fail the audit automatically if raw hex codes are found instead of CSS variables/Tailwind classes.

### Defect Severity Classification
| Severity | Definition | Example |
|---|---|---|
| 🔴 P0 — Blocker | Feature unusable or data loss | Submit button doesn't work |
| 🟡 P1 — Major | Feature degraded, workaround exists | Validation message not showing |
| 🟢 P2 — Minor | Visual deviation from spec | Spacing 4px off from design |
| ⚪ P3 — Cosmetic | No functional impact | Border radius slightly wrong |

## 5. Anti-Patterns
- ❌ Never mark a visual feature as "done" without comparing it to the design-system.md spec.
- ❌ Never skip mobile viewport testing — responsive bugs are often invisible on desktop.
- ❌ Never accept "it works on my machine" — test in a clean browser state (incognito mode).
- ❌ Never report P0 issues as cosmetic — severity misclassification delays critical fixes.
