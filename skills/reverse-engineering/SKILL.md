---
name: reverse-engineering
description: >-
  Perform web reconnaissance on URLs to extract APIs, tech stacks, and design systems to bootstrap BRDs.
---

# Skill: Reverse Engineering (Competitor Intel)

## 1. Metadata
- **Name:** `reverse-engineering`
- **Origin:** `Astesia Product/Design (Ceobe Upgrade Phase 2)`
- **Description:** Protocols for using browser automation or native web fetch tools to scan competitor websites. Extracts technical intelligence (frameworks, API endpoints, design tokens, external services) to rapidly generate highly accurate Business Requirement Documents (BRD) and Design Specs.

## 2. When to Use
Invoke this skill when:
- The user provides a reference URL (e.g., "build something like stripe.com").
- You are in the Product Layer drafting a BRD and need to know what features a competitor has.
- You are in the Design Layer and need to extract exact color palettes or typography from a reference site.

## 3. Practical Guidance

### Step 1: Clarify Reconnaissance Scope
Before scanning, determine what intelligence you need:
- **Product Layer:** Focus on `api_endpoints`, `business_stack` (Stripe, Segment), and `sitemap` (features).
- **Design Layer:** Focus on `design_tokens` (colors, fonts) and `layout_structure`.

### Step 2: Execute the Recon Scan
Use Antigravity's native `read_url_content` or request the user to launch a headless browser script to scan the target URL. 

*If using a browser script, instruct it to extract:*
- `window.__NEXT_DATA__` or similar hydration payloads to reverse-engineer data models.
- Network XHR/Fetch requests to map the backend API contracts.
- Computed CSS styles to extract the exact Design Tokens.

### Step 3: Parse the Intelligence
Do not dump the raw HTML/JSON to the user. Synthesize it:
- **API Contracts:** Convert observed JSON payloads into TypeScript interfaces in your BRD.
- **Tech Stack:** If the site uses Next.js and Tailwind, note it down, but confirm with the user if they want to adopt the same stack or use Astesia's default (SvelteKit/Elysia).
- **Design Tokens:** Directly populate `design-system.md` with the extracted HEX codes and font families.

### Step 4: Map to Critical User Journeys (CUJ)
Use the extracted sitemap (e.g., `/pricing`, `/dashboard`, `/settings/billing`) to automatically draft the CUJs in the BRD. If you see an API call to `POST /api/v1/auth/login`, map that to the Authentication CUJ.

## 4. Anti-Patterns
- ❌ **SSRF Vulnerabilities:** Never scan local networks (`127.0.0.1`, `localhost`, `10.x.x.x`) unless explicitly debugging a local environment.
- ❌ **Copy-Pasting UI:** Do not blindly copy a competitor's exact CSS/HTML layout. Extract the *tokens* and *structure*, then build a clean implementation.
- ❌ **Assuming Stack Consent:** Just because the competitor uses PHP doesn't mean Astesia should. Always ask the user if they want to clone the stack or just the features.
