# Deployment

## Database setup (Supabase Postgres)

The app persists assessments in Postgres via Prisma. This works identically on Vercel, Render, Railway, a company server, or locally - only the env vars change.

### 1. Create a Supabase project

1. Sign up / log in at https://supabase.com and create a new project (the free tier is enough for this app).
2. Once provisioned, go to **Project Settings > Database > Connection string**.
3. You need two connection strings:
   - **Pooled** (Transaction mode, port `6543`, with `?pgbouncer=true` appended) - this is `DATABASE_URL`, used by the app at runtime.
   - **Direct** (Session mode, port `5432`) - this is `DIRECT_URL`, used only by `prisma migrate`. Migrations fail through the connection pooler, which is why both are needed.

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in both connection strings with your project's password and host:

```
cp .env.example .env.local
```

On a hosted platform (Vercel, Render, Railway, etc.), set `DATABASE_URL` and `DIRECT_URL` in that platform's project/environment settings instead of committing `.env.local` (it's gitignored and should never be committed).

**Two things that will otherwise cause a `28P01` "password authentication failed" error:**
- Supabase's dashboard shows the password as a `[YOUR-PASSWORD]` placeholder in brackets - replace the whole bracketed placeholder with your actual password, don't leave the brackets in.
- If your password itself contains a reserved URL character (`@`, `:`, `/`, `?`, `#`, `%`), it must be percent-encoded (e.g. `@` becomes `%40`) or the connection string parser will misread where the password ends and the host begins.

**Locally, the Prisma CLI (`prisma migrate`, `prisma generate`) only auto-loads a plain `.env` file, not `.env.local`** (that's a Next.js-specific convention the CLI doesn't know about). Keep both in sync locally:

```
cp .env.local .env
```

(`.env` is gitignored the same way `.env.local` is.) On a hosted platform this doesn't matter - you set the env vars directly in that platform's settings, and both the app runtime and any CI-run `prisma migrate deploy` step read from there.

### 3. Install dependencies and generate the Prisma client

```
npm install
```

`postinstall` runs `prisma generate` automatically, so the typed client is regenerated on every install, on every host.

### 4. Run the migration

First time, locally (creates the migration files and applies them):

```
npx prisma migrate dev --name init
```

On every subsequent deploy (applies existing migrations without prompting):

```
npx prisma migrate deploy
```

### 5. (Optional) Migrate historical JSONL data

If `data/assessments.jsonl` has entries from before this cutover you want to keep:

```
npx ts-node --compiler-options "{\"module\":\"commonjs\",\"moduleResolution\":\"node\"}" scripts/migrate-jsonl-to-db.ts
```

The `--compiler-options` override is needed because `tsconfig.json` is set up for Next.js's own bundler (`module: ESNext`), which `ts-node` can't run standalone - the override tells `ts-node` to compile this one script as CommonJS instead, without changing the project's tsconfig. Safe to skip the whole step if you don't have pre-existing local assessment history you care about.

### 6. Verify persistence survives a stateless invocation

Since the whole point of this migration is that state must not depend on the local filesystem, confirm it with two independent process invocations against the same database. Save this as a temporary `scripts/_smoke-write.ts`:

```ts
import 'dotenv/config';
import { appendAssessment } from '../lib/assessment-log';

appendAssessment({
  systemName: 'Smoke Test', description: 'test', classification: 'MINIMAL_RISK',
  confidenceScore: 50, evidenceStrength: 25, violations: [], highRiskMatches: [],
  applicableArticles: [], obligations: [], reasoning: 'test',
  metadata: { industry: 'Software', geographies: ['EU'], fundamentalRightsImpact: false, crossBorderImpact: false },
}).then(r => { console.log('wrote', r.id); process.exit(0); });
```

Run it, then in a **separate** process run the equivalent read (`getLatestAssessments(1)` instead of `appendAssessment`) against a `scripts/_smoke-read.ts`:

```
npx ts-node --compiler-options "{\"module\":\"commonjs\",\"moduleResolution\":\"node\"}" scripts/_smoke-write.ts
npx ts-node --compiler-options "{\"module\":\"commonjs\",\"moduleResolution\":\"node\"}" scripts/_smoke-read.ts
```

If the second process (which shares no memory or filesystem state with the first) reads the record back, persistence is confirmed independent of any single process/host instance. Delete both temporary scripts and the smoke-test row afterward.

## Auth setup

The app is guarded by a seed-user-administered login: one pre-provisioned
seed user can create other users and reset anyone's password; there is no
self-service password change or "forgot password" flow (no SMTP in this
MVP), so non-seed users receive their credentials out of band from the
admin.

### 1. Generate a session secret

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set the result as `SESSION_SECRET` in `.env.local` (and `.env`, locally).
Rotating this value invalidates all existing sessions.

### 2. Set seed user credentials

Set `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` in `.env.local` (local) or the
host's environment variable settings (deployed) - never commit real values.

### 3. Run the bootstrap script

```
npm run seed:user
```

Safe to re-run - it upserts by email, so re-running after changing
`SEED_USER_PASSWORD` rotates the seed user's password.

### 4. Log in and rotate the seed password

Log in at `/login` with the seed credentials, then use `/admin/users` (seed
user only) to reset that same account's password to a value that isn't
sitting in any env file history.

## Required environment variables

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | App runtime | Supabase pooled connection string (port 6543, `pgbouncer=true`) |
| `DIRECT_URL` | `prisma migrate` | Supabase direct connection string (port 5432) |
| `SEED_USER_EMAIL` | `npm run seed:user` (bootstrap only) | Not read by the running app |
| `SEED_USER_PASSWORD` | `npm run seed:user` (bootstrap only) | Rotate after first login |
| `SESSION_SECRET` | App runtime (`lib/auth.ts`) | HMAC key for session cookies; rotating invalidates all sessions |
