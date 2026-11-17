---
name: cost-reducer
description: >-
  Patterns and tactics to minimize AI token consumption and API costs during agentic workflows, without sacrificing output quality.
---

# Skill: LLM Cost Reduction & Token Efficiency

## 1. Metadata
- **Name:** `cost-reducer`
- **Origin:** `Astesia Core`
- **Description:** Patterns and tactics to minimize AI token consumption and API costs during agentic workflows, without sacrificing output quality.

## 2. When to Use
Invoke this skill when:
- The project uses heavy LLM API calls (classification, generation, summarization).
- The user mentions cost constraints or budget limits.
- Building agentic systems that need to run many concurrent AI calls.

## 3. Core Patterns

### Pattern 1: Temperature Discipline
Use the right temperature for each task type. Wrong temperature wastes tokens on regeneration.

| Task Type | Recommended Temperature | Reason |
|---|---|---|
| Classification / Skill Router | `0.0` | Must be deterministic; no variation needed |
| BRD / Architecture generation | `0.1–0.2` | Structured output, low creativity needed |
| Design / UI specs | `0.3` | Some creativity, but must stay structured |
| Code execution | `0.1` | Precise, no hallucinations |
| Open brainstorm | `0.7` | Creativity encouraged |

### Pattern 2: Prompt Compression
- **Never repeat context** that's already in the system prompt within user messages.
- **Use templates** (like BRD template, architecture template) to constrain output format — shorter outputs = cheaper.
- **Conditional injection:** Only inject skill content if it's actually needed for the current task.

### Pattern 3: Output Scope Control
Always tell the LLM explicitly what NOT to include:
```
Output ONLY the markdown document.
Do NOT include: greetings, explanations of what you're doing, 
code examples (unless required by template), or filler text.
```

### Pattern 4: Chunked Retrieval over Full Context
- Never load the entire codebase into context.
- Use `system-map.md` + conceptual tags to retrieve only the 3-5 most relevant files.
- If using Antigravity's internal RAG memory, limit top-K to 5 results.

### Pattern 5: Short-Circuit Classification
Before running an expensive generation (BRD, Architecture), run a cheap classification first:
```
Question: "Is this a greenfield or brownfield request?"
Temperature: 0.0, Max tokens: 10
Answer: "greenfield" or "brownfield"
```
This determines which workflow branch to follow without burning context on full analysis.

## 4. Cost Estimation Guidelines

| Operation | Approx Token Cost | Optimization Lever |
|---|---|---|
| Skill Classification | ~500 tokens | Use concise skill names only |
| BRD Generation | ~2,000–4,000 tokens | Use strict template format |
| Architecture Design | ~3,000–6,000 tokens | Limit to tech stack + folder structure |
| Code Execution per file | ~1,000–3,000 tokens | Inject only relevant files |
| Audit Pass | ~4,000–8,000 tokens | Feed combined context, not separate calls |

## 5. Anti-Patterns
- ❌ Never inject all available skills into context "just in case."
- ❌ Never use high temperature (>0.5) for structured output tasks.
- ❌ Never load files >100KB into context — summarize or chunk them.
- ❌ Never run classification AND generation in the same token budget — separate them.
