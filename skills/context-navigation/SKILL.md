---
name: context-navigation
description: >-
  Navigate large codebases efficiently using conceptual tags, lexical search, and Reciprocal Rank Fusion without token bloat.
---

# Skill: Token Efficiency & Context Navigation

## 1. Metadata
- **Name:** `context-navigation`
- **Origin:** `Astesia Core (Ceobe Upgrade Phase 2)`
- **Description:** Protocols for navigating large enterprise codebases efficiently without exhausting the context window or resorting to blind full-codebase scans. Combines conceptual tag navigation with lexical search using Reciprocal Rank Fusion (RRF).

## 2. Trigger
Whenever Astesia is asked to modify, debug, or understand a feature within an existing repository.

## 3. Rules & Execution

### Rule 1: Navigation Priority Hierarchy
Before modifying code, follow this targeted search order:
1. `system-map.md` conceptual tags -> locate relevant modules by concept.
2. Exact keyword / ripgrep search -> locate specific symbols, routes, or error strings.
3. Targeted line reading (targeted line range or function block only) -> read the minimum needed lines.
4. **NEVER:** blind recursive directory scans or reading entire repos as primary navigation.

### Rule 2: Dual Queries & Reciprocal Rank Fusion (RRF)
When exploring an unfamiliar concept in a large codebase:
- **Lexical Query:** Exact symbol, route, or error string (e.g. `verifyToken`, `POST /api/v1/auth`).
- **Semantic Query:** Intent description matched against `system-map.md` tags (e.g. `[auth, jwt, session]`).

**RRF Ranking Model:**
- **Rank 1:** Files appearing in BOTH tag navigation and keyword matches (highest relevance).
- **Rank 2:** Files matching the concept strongly in `system-map.md`.
- **Rank 3:** Files matching only generic keywords. Only read if Rank 1 and 2 are insufficient.

### Rule 3: Token Budget Enforcement
- For files >500 lines, extract AST signatures or inspect targeted function ranges, never full-read.
- Pull a maximum of **5 files** per investigation cycle before formulating an action.
- Do not open files outside the trace path (Entrypoint -> Handler -> Service -> Repository -> DB).

### Rule 4: System Map First
Before inspecting implementation files, locate and read `.astesia/system-map.md` to grasp architectural boundaries.

## 4. Anti-Patterns
- ❌ **Grep-Only Blindness:** Relying solely on keyword search and missing files due to naming differences.
- ❌ **Semantic Hallucination:** Relying on conceptual assumptions without verifying actual symbols.
- ❌ **Mass Loading:** Opening more than 5 search results at once. Limit strictly to Top 5.
- ❌ **Full File Ingestion:** Reading 1000-line files when only one function is relevant.
