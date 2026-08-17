# HD-System Environments

## Architecture

| Environment | Supabase Project | Branch | URL |
|------------|-----------------|--------|-----|
| **Production** | `tixwhmgzibvazkqbqoev` | `main` | https://hd-system.pages.dev |
| **Staging** | `YOUR_STAGING_PROJECT_ID` | `staging` | https://staging.hd-system.pages.dev |
| **Local** | `supabase start` | any | http://localhost:3000 |

## Setup

### 1. Create Staging Project
1. Go to https://app.supabase.com → New Project
2. Name: `hd-system-staging`
3. Region: Same as production (e.g., South America)
4. Database password: Generate and save securely

### 2. Link Staging Project
```bash
# Link to staging
supabase link --project-ref YOUR_STAGING_PROJECT_ID

# Push schema
supabase db push

# Reset data (if needed)
supabase db reset
```

### 3. Configure Environment Variables

**Staging (.env.staging):**
```
VITE_SUPABASE_URL=https://YOUR_STAGING_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=your-staging-anon-key
VITE_SENTRY_DSN=your-staging-sentry-dsn
```

**Production (.env.production):**
```
VITE_SUPABASE_URL=https://tixwhmgzibvazkqbqoev.supabase.co
VITE_SUPABASE_ANON_KEY=your-production-anon-key
VITE_SENTRY_DSN=your-production-sentry-dsn
```

### 4. Deploy

**Cloudflare Pages:**
- `main` branch → Production deployment
- `staging` branch → Staging deployment

**Manual:**
```bash
# Build for staging
VITE_SUPABASE_URL=https://staging.supabase.co npm run build:cloudflare

# Build for production
npm run build:cloudflare
```

## Data Isolation

- Staging and Production have **completely separate databases**
- No data sync between environments
- Staging can be reset without affecting production
- Test data should only be created in staging

## Migrations

All migrations must be tested in staging before production:

```bash
# Test migration in staging
supabase link --project-ref STAGING_PROJECT_ID
supabase db push

# Verify in staging SQL Editor
# Then apply to production
supabase link --project-ref PRODUCTION_PROJECT_ID
supabase db push
```

## Troubleshooting

### Staging data looks wrong
- Staging is a separate database — data doesn't sync from production
- Use `supabase db reset` to clear staging data

### RLS policies different between environments
- Run `supabase db push` to sync schema
- Check `RLS_FIXES.sql` in both environments

### Connection issues
- Verify project link: `supabase projects list`
- Check API keys in Supabase Dashboard → Settings → API
