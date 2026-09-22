# EU AI Act Internal Governance Tool

An internal, company-facing tool that helps a product team (1) describe an AI
product through a guided, branching questionnaire, (2) determine which EU AI
Act risk category and obligations plausibly apply, (3) see what internal
governance structure should own that risk, and (4) track the evidence
checklist needed to demonstrate internal readiness before pursuing formal EU
compliance work (legal review, conformity assessment, etc.).

**This tool is not an EU compliance auditor and does not provide legal
advice.** See [`REQUIREMENTS.md`](REQUIREMENTS.md) for the full scope note,
gap analysis, and target design this build follows, and
[`ACTION_PLAN.md`](ACTION_PLAN.md) for the phased implementation plan.

---

## Current state (MVP)

The app has moved past the original static-form prototype. As of this
writing:

- **Adaptive Q&A wizard** (`pages/assess.tsx`, driven by `lib/assessment-flow.ts`)
  — a multi-step, branching interview: AI-system gate → product
  characterization → role in the value chain (provider/deployer/importer/
  distributor/product manufacturer, multi-select) → sector-specific
  questions → Article 5 prohibited-practice screening → Article 6(3)
  exemption questions (only when an Annex III category matched) →
  geography/vulnerable groups/cross-border impact → free-text description.
  Progress is saved to a `QaSession` on every step so a partially completed
  interview can be resumed.
- **Classification engine** (`lib/classification-engine.ts`) takes the
  structured wizard answers (not just free-text keyword matching) and
  applies, in order: Article 5 (prohibited, always exclusive) → Annex I/III
  matching with the Article 6(3) exemption check applied before defaulting
  to `HIGH_RISK` → Article 50 transparency → GPAI, including a systemic-risk
  sub-classification (Article 51 compute threshold) → role-filtered
  obligations → organizational risk score → `MINIMAL_RISK` default.
  Annex III and Article 50 obligations can co-apply in one result. The
  result includes a reasoning trace, an uncertainty/confidence summary, and
  a **governance structure block** (recommended internal owner, review
  cadence, escalation path) rather than a flat obligations list.
- **Evidence checklist** — each applicable obligation becomes a persisted,
  trackable `ChecklistItem` (status, owner, evidence link) tied to the
  assessment, updatable independently via
  `PATCH /api/systems/:id/checklist/:itemId` without re-running the
  questionnaire.
- **Append-only audit trail** — every assessment submission and every
  checklist status/owner/evidence-link change writes an `AuditEvent`
  (previous value, new value, actor, timestamp), readable per system via
  `GET /api/systems/:id/audit`.
- **Australia AI practices alignment** (`lib/australia-alignment.ts`) — if
  "Australia" is selected as a geography, a 12-question step evaluates
  alignment against the voluntary DISR/National AI Centre *Guidance for AI
  Adoption* (21 Oct 2025), producing a separate aligned/partial/gap verdict
  and checklist items alongside (and without affecting) the EU
  classification.
- **On-demand PDF report** (`lib/report-pdf.ts`,
  `GET /api/systems/:id/report.pdf`) — a single, timestamped document
  combining the submitted answers, the classification/reasoning trace, the
  governance block, and the checklist's live status, generated server-side
  from current database state so it reflects checklist changes made after
  the original assessment.
- **Authentication** — a seed-user-administered model (`lib/auth.ts`,
  `lib/users.ts`): one pre-provisioned seed user (env-configured, bootstrapped
  via `npm run seed:user`) logs in and creates other users; only the seed
  user can create users or reset passwords (`/admin/users`). There is no
  self-service password reset or SMTP flow in this MVP — non-seed users get
  credentials out of band. Sessions are signed HttpOnly cookies
  (HMAC-SHA256), not a third-party auth service.
- **Persistent database** — Supabase Postgres via Prisma
  (`prisma/schema.prisma`) replaces the original append-only JSONL file, so
  state survives stateless/serverless hosting (Vercel or otherwise). Models:
  `Assessment`, `ChecklistItem`, `AuditEvent`, `QaSession`, `User`.
- **Admin storage tools** (`/admin/storage`, seed-user only) — see free-tier
  database usage by table, download any record as a PDF, and delete
  individual records or bulk-purge everything before a date.
- **Optional LLM-assisted intake** (`lib/llm`, `lib/intake-suggest.ts`,
  `lib/intake-clarify.ts`) — the free-text description can be sent to an LLM
  (Gemini by default; OpenAI or Claude via env var) to suggest structured
  wizard answers and ask clarifying questions for the user to confirm or
  edit. The LLM never determines the classification itself — the
  deterministic engine always computes the final result from the confirmed
  structured answers.

### Known gaps / not yet done

- `data/assessments.json(l)` and `data/rules1.yaml` are leftovers from the
  pre-database version and are not read by the running app; `data/rules.yaml`
  is still the source the engine loads at startup.
- `archive/` holds the original packaging docs from an earlier AI-generated
  scaffold (numbered files like `01_classification-engine.ts` that no longer
  exist) — kept for history only, not part of the current setup path.

---

## Getting started

### 1. Install dependencies

```bash
npm install
```

`postinstall` runs `prisma generate` automatically.

### 2. Configure environment variables

```bash
cp .env.example .env.local
cp .env.local .env   # the Prisma CLI only auto-loads .env, not .env.local
```

Fill in `DATABASE_URL` / `DIRECT_URL` (Supabase Postgres), `SESSION_SECRET`,
`SEED_USER_EMAIL` / `SEED_USER_PASSWORD`, and an LLM provider key if you want
intake assistance. Full details, including common connection-string
gotchas, are in [`DEPLOYMENT.md`](DEPLOYMENT.md).

### 3. Run the database migration

```bash
npx prisma migrate dev --name init
```

### 4. Bootstrap the seed user

```bash
npm run seed:user
```

### 5. Start the dev server

```bash
npm run dev
```

Log in at `http://localhost:3000/login` with your seed credentials, then
rotate the seed password from `/admin/users`.

---

## Project structure

```
lib/
  classification-engine.ts   Core classification logic + governance/checklist mapping
  assessment-flow.ts         Wizard step order, branching, and completeness rules
  assessment-log.ts          Assessment persistence (Prisma-backed)
  checklist.ts               Checklist item reads/updates + audit event writes
  audit-events.ts            Append-only audit log
  qa-sessions.ts             In-progress wizard draft persistence
  auth.ts / users.ts         Session cookies, password hashing, user CRUD
  australia-alignment.ts     Australia voluntary AI guidance alignment engine
  report-pdf.ts              Server-side PDF report generation
  llm/                       Provider-agnostic LLM client (Gemini/OpenAI/Anthropic)
  intake-suggest.ts / intake-clarify.ts   LLM-assisted intake helpers

pages/
  assess.tsx        Multi-step assessment wizard
  dashboard.tsx      Stats, history, and results
  login.tsx          Login screen
  admin/             Seed-user-only: user management, storage/backup/purge
  api/               classify, assessments, systems/:id (+checklist, audit, report.pdf),
                     sessions, users, auth, admin, intake, rules

data/rules.yaml      Article 5 / Annex I / Annex III / Article 50 / GPAI rule data
prisma/schema.prisma Database schema (Assessment, ChecklistItem, AuditEvent, QaSession, User)
```

---

## Testing

```bash
npm test                # run the Jest suite
npm run test:watch      # watch mode
npm run test:coverage   # coverage report
npx tsc --noEmit        # type check
```

All 231 tests pass and `tsc --noEmit` is clean.

---

## Deployment

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for full setup: Supabase provisioning,
required environment variables, auth bootstrap, and the LLM provider
switch. The app is host-agnostic (Vercel, Render, Railway, a company
server, or local) — only environment variables change.
