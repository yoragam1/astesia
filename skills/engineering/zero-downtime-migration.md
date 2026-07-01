# Skill: Zero-Downtime Database Migration

## 1. Metadata
- **Name:** `zero-downtime-migration`
- **Origin:** `Astesia Core`
- **Description:** The Expand and Contract pattern for safely evolving database schemas in production without causing downtime or data loss. Mandatory for all brownfield schema changes.

## 2. When to Use
Invoke this skill when:
- Renaming a column or table in a production database.
- Removing a column or table that is still referenced by existing code.
- Changing a column's data type.
- Adding a NOT NULL constraint to an existing column that has nulls.

**Do NOT use** for greenfield projects where the DB has no live data yet.

## 3. The Expand and Contract Pattern

The core principle: **Never make a breaking change in one step.** Split every destructive migration into 3 phases.

### Phase 1: EXPAND — Add the new structure alongside the old
```sql
-- ✅ SAFE: Add the new column WITHOUT removing the old one
ALTER TABLE users ADD COLUMN full_name VARCHAR(255);

-- ✅ SAFE: Start populating the new column from the old ones
UPDATE users SET full_name = first_name || ' ' || last_name;
```

**Application code during Phase 1:**
- Write to BOTH old columns (`first_name`, `last_name`) AND new column (`full_name`).
- Read from OLD columns (they are the source of truth).

### Phase 2: MIGRATE — Backfill and verify
```sql
-- Backfill all existing rows
UPDATE users SET full_name = first_name || ' ' || last_name WHERE full_name IS NULL;

-- Verify no nulls remain before adding constraint
SELECT COUNT(*) FROM users WHERE full_name IS NULL; -- Must be 0
```

**Application code during Phase 2:**
- Write to BOTH old and new columns.
- Read from NEW column (shift reads over after verifying data integrity).
- Monitor for errors. Rollback plan: revert application code to read from old columns.

### Phase 3: CONTRACT — Remove the old structure
```sql
-- ✅ SAFE: Only after ALL application instances read from the new column
ALTER TABLE users DROP COLUMN first_name;
ALTER TABLE users DROP COLUMN last_name;
```

**Prerequisite before Phase 3:**
- [ ] ALL application instances have been deployed with code that reads from `full_name`.
- [ ] Zero errors in production logs related to the old columns.
- [ ] Rollback window has passed (e.g., 24-48 hours of stable operation).

## 4. Drizzle ORM Migration Example

```typescript
// Migration 001: EXPAND — Add new column
export async function up(db: NodePgDatabase) {
  await db.execute(sql`ALTER TABLE users ADD COLUMN full_name VARCHAR(255)`);
  await db.execute(sql`
    UPDATE users SET full_name = first_name || ' ' || last_name
  `);
}

// Migration 002: CONTRACT — Remove old columns (separate migration file!)
// Only run after Phase 2 verification is complete
export async function up(db: NodePgDatabase) {
  await db.execute(sql`ALTER TABLE users DROP COLUMN first_name`);
  await db.execute(sql`ALTER TABLE users DROP COLUMN last_name`);
}
```

## 5. Forbidden Operations (Single-Step Destructive Changes)

These MUST NEVER be done in a single migration on a live production database:

```sql
-- ❌ FORBIDDEN: Single-step rename (breaks running app immediately)
ALTER TABLE users RENAME COLUMN first_name TO full_name;

-- ❌ FORBIDDEN: Drop a column that running code still reads
ALTER TABLE users DROP COLUMN email;

-- ❌ FORBIDDEN: Add NOT NULL without default or backfill
ALTER TABLE orders ADD COLUMN invoice_number VARCHAR(50) NOT NULL;
```

## 6. Pre-Migration Checklist
- [ ] Is this a production database with live data? If yes → use Expand and Contract.
- [ ] Do I know which application code reads the column I'm changing? (Check system-map.md)
- [ ] Do I have a rollback plan for each migration phase?
- [ ] Have I estimated the migration time? (Large tables → use batched updates, not full table lock)
- [ ] Is the migration idempotent? (Can it be safely re-run if it fails midway?)

## 7. Anti-Patterns
- ❌ Never merge Phase 1 (Expand) and Phase 3 (Contract) into a single migration file.
- ❌ Never rename columns directly — always Add → Migrate → Drop.
- ❌ Never run migrations during peak traffic hours.
- ❌ Never add a NOT NULL constraint without a DEFAULT or backfill strategy.
