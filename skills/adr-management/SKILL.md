---
name: adr-management
description: >-
  Capture architectural decisions made during Astesia sessions as structured ADRs. Auto-detects decision moments, records context, alternatives considered, and rationale. Maintains an ADR log so future developers understand why the codebase is shaped the way it is.
---

# Skill: Architecture Decision Records (ADR) Management

## 1. Metadata
- **Name:** `adr-management`
- **Origin:** `Arene (Adapted for Astesia IDE Agent)`
- **Description:** Capture architectural decisions made during Astesia sessions as structured ADRs. Auto-detects decision moments, records context, alternatives considered, and rationale. Maintains an ADR log so future developers understand why the codebase is shaped the way it is.

## 2. When to Activate
- User explicitly says "let's record this decision" or "ADR this"
- User chooses between significant alternatives (framework, library, pattern, database, API design)
- User asks "why did we choose X?" (read existing ADRs)
- During the Product or Architecture planning phases when trade-offs are discussed

## 3. ADR Format
Use the lightweight ADR format.

```markdown
# ADR-NNNN: [Decision Title]

**Date**: YYYY-MM-DD
**Status**: proposed | accepted | deprecated | superseded by ADR-NNNN
**Deciders**: [who was involved]

## Context
What is the issue that we're seeing that is motivating this decision or change?
[2-5 sentences describing the situation, constraints, and forces at play]

## Decision
What is the change that we're proposing and/or doing?
[1-3 sentences stating the decision clearly]

## Alternatives Considered
### Alternative 1: [Name]
- **Pros**: [benefits]
- **Cons**: [drawbacks]
- **Why not**: [specific reason this was rejected]

## Consequences
What becomes easier or more difficult to do because of this change?
### Positive
- [benefit 1]
### Negative
- [trade-off 1]
### Risks
- [risk and mitigation]
```

## 4. Workflow

### Capturing a New ADR
When a decision moment is detected:
1. **Initialize (first time only)** — if `.astesia/adr/` does not exist, ask the user for confirmation before creating the directory and a `README.md` index table header.
2. **Identify the decision** — extract the core architectural choice being made.
3. **Gather context** — what problem prompted this? What constraints exist?
4. **Document alternatives** — what other options were considered? Why were they rejected?
5. **State consequences** — what are the trade-offs?
6. **Assign a number** — scan existing ADRs in `.astesia/adr/` and increment.
7. **Write to file** — e.g. `.astesia/adr/0001-decision-title.md`
8. **Update the index** — append to `.astesia/adr/README.md`

### ADR Directory Structure
```
.astesia/
└── adr/
    ├── README.md              ← index of all ADRs
    ├── 0001-use-sveltekit.md
    ├── 0002-postgres-over-mongo.md
```

## 5. Decision Detection Signals
**Explicit signals**
- "Let's go with X"
- "We should use X instead of Y"
- "Record this as an ADR"

**Implicit signals** (suggest recording an ADR)
- Comparing two frameworks or libraries and reaching a conclusion
- Making a database schema design choice with stated rationale
- Selecting deployment infrastructure after evaluating alternatives
