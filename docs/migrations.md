# Versioned Migrations Guide

## Current State

HD-System uses **manual SQL files** in `supabase/` for migrations. This works but lacks versioning and rollback.

## Recommended Approach: Supabase CLI Migrations

### 1. Initialize (if not already done)
```bash
supabase init
```

### 2. Create a Migration
```bash
# Auto-generates timestamped file
supabase migration new add_audit_log

# Creates: supabase/migrations/20260817120000_add_audit_log.sql
```

### 3. Write the Migration
```sql
-- supabase/migrations/20260817120000_add_audit_log.sql

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- ... columns
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "audit_log_insert" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (true);
```

### 4. Apply Migration
```bash
# Local
supabase db reset

# Remote (staging)
supabase link --project-ref STAGING_ID
supabase db push

# Remote (production)
supabase link --project-ref PRODUCTION_ID
supabase db push
```

### 5. Rollback (if needed)
```bash
# Create a down migration
supabase migration new rollback_audit_log
# Write reverse SQL, then apply
```

## Migration Naming Convention

```
YYYYMMDDHHMMSS_description.sql
```

Examples:
- `20260817120000_add_audit_log.sql`
- `20260818090000_add_indexes.sql`
- `20260819140000_fix_rls_policies.sql`

## Best Practices

1. **Idempotent**: Use `IF NOT EXISTS`, `IF EXISTS` for safety
2. **One logical change per migration**: Don't mix unrelated changes
3. **Test locally first**: `supabase db reset` before pushing
4. **Never modify applied migrations**: Create new ones instead
5. **Document in commit message**: What the migration does and why

## Current Manual Migrations

These files should be converted to versioned format:

| File | Description | Priority |
|------|-------------|----------|
| `AUDIT_LOG_TABLE.sql` | Audit log table | High |
| `ATOMIC_RPCS.sql` | 5 atomic RPC functions | High |
| `AUDIT_FIXES.sql` | CHECK constraints + indexes | Medium |
| `RLS_FIXES.sql` | RLS policies + helpers | Already in migrations |

## Converting Manual Migrations

```bash
# 1. Create migration from existing file
supabase migration new convert_audit_log

# 2. Copy content from manual file
cp supabase/AUDIT_LOG_TABLE.sql supabase/migrations/20260817120000_convert_audit_log.sql

# 3. Apply
supabase db reset  # local test
supabase db push   # remote deploy
```
