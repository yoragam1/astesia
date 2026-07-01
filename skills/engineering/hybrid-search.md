---
name: "Hybrid Semantic Search (RRF)"
description: "Use Reciprocal Rank Fusion to combine exact keyword search and vector semantic search for codebase discovery."
---
# Skill: Hybrid Semantic Search (RRF)

## 1. Metadata
- **Name:** `hybrid-search`
- **Origin:** `Astesia Engineering (Ceobe Upgrade Phase 2)`
- **Description:** Protocol for querying massive codebases by combining lexical search (exact keyword match / grep) with semantic search (embeddings). Uses the concept of Reciprocal Rank Fusion (RRF) to find the most relevant files without full-scan token bloat.

## 2. When to Use
Invoke this skill when:
- You are in a large Brownfield project and need to locate a specific feature or bug.
- Pure grep/keyword search returns too many results or zero results (due to synonyms).
- You need to understand where a concept (like "user authentication" or "payment processing") is scattered across the codebase.

## 3. Practical Guidance

### Step 1: Formulate Dual Queries
When looking for a piece of code, formulate two distinct query types:
1. **Lexical (Keyword):** Exact function names, variable names, or unique error strings (e.g., `grep_search("verifyToken")`).
2. **Semantic (Concept):** Natural language description of the intent (e.g., "middleware that checks if the JWT is valid and not expired").

### Step 2: Execute the Hybrid Search
If you have access to a `search_codebase` semantic tool, run the Semantic query.
If you only have `grep_search`, use a Conceptual Tag approximation:
- Search for the tags in `system-map.md`.
- Search for the exact class/function name.

### Step 3: Reciprocal Rank Fusion (Mental Model)
Cross-reference the results from both searches:
- Files that appear in **both** the lexical search AND the semantic search are given the highest priority (Rank 1).
- Files that appear only in the semantic search but have a strong conceptual match are Rank 2.
- Files that only match a generic keyword (e.g., a utility function named `verify` that has nothing to do with JWTs) are Rank 3.

### Step 4: Targeted Reading
Only invoke `view_file` on Rank 1 and Rank 2 files. Never read Rank 3 files unless all higher-ranked files are exhausted.

## 4. Anti-Patterns
- ❌ **Grep-Only Blindness:** Relying solely on `grep` and failing to find a file because the previous engineer named the class `AuthValidator` instead of `TokenVerifier`.
- ❌ **Semantic Hallucination:** Relying solely on semantic search and missing the exact config file because it lacked natural language comments.
- ❌ **Mass Loading:** Opening the top 20 search results simultaneously. Strictly limit to Top 5.
