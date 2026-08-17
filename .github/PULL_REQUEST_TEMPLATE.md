## Summary

<!-- Brief description of what this PR does -->

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Database migration
- [ ] Configuration change

## Changes

<!-- List the key changes -->

- 
- 
- 

## Testing

- [ ] `npm run build` passes
- [ ] `npm test` passes (44 tests)
- [ ] Manual testing in browser

## AGENTS.md Checklist

- [ ] **RLS**: If new table, has RLS enabled with policies
- [ ] **Branch isolation**: If branch-scoped, has `filterBySelectedBranch`
- [ ] **notify()**: If localStorage write, calls `this.notify()`
- [ ] **Anti-duplicate**: If async operation, has guard (`useRef`, `force`)
- [ ] **Schema verification**: If SQL, checks `information_schema` first
- [ ] **FK check**: If DELETE, verifies foreign key dependencies
- [ ] **No `USING (true)`**: RLS policies never use permissive `USING (true)`

## Database Changes

- [ ] New table created with RLS
- [ ] Migration is idempotent (`DROP IF EXISTS` + `CREATE`)
- [ ] `SUPABASE_SCHEMA.md` updated
- [ ] Realtime publication updated (if needed)

## Screenshots

<!-- If applicable, add screenshots -->

## Related Issues

<!-- Link related issues: Fixes #123, Closes #456 -->

## Deployment Notes

<!-- Any special deployment steps, environment variables, etc. -->

