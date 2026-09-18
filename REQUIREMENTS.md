# EU AI Act Internal Governance Tool — Requirements & Gap Analysis

**Status:** Draft for review
**Scope note:** This tool is **not** an EU compliance auditor and does not provide legal advice. It is an internal, company-facing checklist tool that helps a product team (1) describe their AI product through guided Q&A, (2) determine which EU AI Act risk category and obligations plausibly apply, (3) identify what internal governance structure is needed to own that risk, and (4) produce a checklist of evidence/artifacts the company should be able to show to demonstrate internal readiness before pursuing formal EU compliance work (legal review, conformity assessment, etc.).

---

## 1. Current State (What Exists Today)

A Next.js/TypeScript app (`AI_Governance`) with:

| Component | File | What it does |
|---|---|---|
| Classification engine | `lib/classification-engine.ts` | Concatenates system name + description + industry into one text blob, runs it through keyword/fuzzy-match triggers loaded from `data/rules.yaml`, in a fixed step order: Article 5 (prohibited) → Annex I (safety components) → Annex III (high-risk categories) → Article 50 (transparency) → GPAI keyword → organizational risk score (severity × likelihood) → default Minimal Risk |
| Rules data | `data/rules.yaml` | Encodes Article 5 prohibited practices, Annex I/III trigger keywords, an Article 6(3) exemption test (defined but unused), Article 50 triggers, GPAI provider obligations |
| Assessment log | `lib/assessment-log.ts` | Append-only local JSONL file (`data/assessments.jsonl`); stats/search/export helpers |
| UI | `pages/dashboard.tsx`, `pages/index.tsx` | One static, single-page form (name, description, industry dropdown, geography/vulnerable-group checkboxes, two impact checkboxes, severity/likelihood 1–5); submits once and shows a result card |
| API | `pages/api/classify.ts`, `pages/api/assessments.ts` (+ orphaned `pages/api/assessments/route.ts`) | POST classify, GET query/export |
| Tests | `__tests__/*.test.ts` | 93+ Jest unit tests on engine + log |

This is a solid skeleton (typed, tested, validated) but it was built as a **static form + keyword classifier**, not the **adaptive governance interview** described in the product goal.

---

## 2. Gap Analysis

Gaps are grouped by the four outputs the tool is supposed to produce, plus cross-cutting/technical gaps. Severity: 🔴 Critical (wrong or missing core output) · 🟠 High · 🟡 Medium.

### 2.1 "What kind of AI product is this?" (product characterization)

- 🔴 **No conversational Q&A exists.** The form is flat and static — no follow-up questions, no branching based on prior answers, nothing that helps a non-expert articulate what they've built (GPAI/foundation model, RAG app, recommender, classifier, embedded safety component, autonomous agent, chatbot, etc.).
- 🟠 **No "is this even an AI system" gate.** Article 3(1) of the Act defines "AI system"; plain rule-based automation should be filtered out early. The tool has no such question.
- 🟡 **Free-text matching, not reasoning.** Classification depends on the user's wording hitting a fixed keyword list (even fuzzy-matched). It doesn't interpret intent, so a correctly-described product can still be missed or misclassified if it doesn't use the expected words.

### 2.2 "What EU AI Act category does it fall in?" (classification correctness)

- 🔴 **Article 6(3) exemption logic is dead data.** `rules.yaml` defines the exemption test (narrow procedural task / improves a completed human activity / pattern detection without materially influencing a decision / preparatory work) as a required step before assigning HIGH_RISK via Annex III — but `classification-engine.ts` never references it. Every Annex III keyword hit is auto-classified HIGH_RISK, which does not match how the Act actually works and will over-classify systems.
- 🔴 **No provider/deployer/importer/distributor role capture.** Obligations differ substantially by role (Articles 16–27, 26). The form never asks this, so today's flat "obligations" list is implicitly provider-only and silently wrong for a deployer.
- 🟠 **GPAI is one flat bucket.** No systemic-risk tier (Article 51, compute threshold) distinction, which changes provider obligations materially.
- 🟡 **Single-pass, first-match classification.** The engine returns on the first rule it hits (e.g., stops at Annex I without also checking whether Article 5 prohibitions *and* Annex III both apply in combination); real systems can trigger multiple obligations simultaneously.

### 2.3 "What governance structure is needed?" (organizational accountability)

- 🔴 **Not produced at all.** The output is a flat list of Article names/one-line obligations (e.g., "Article 9: Risk Management System"). There is no mapping to:
  - who inside the company should own this risk (e.g., AI governance committee, product owner, DPO/legal, security)
  - what recurring review cadence is expected (e.g., pre-launch review, periodic re-assessment, post-incident review)
  - what sign-off/escalation path is required before launch
  - how this system should be registered/tracked in an internal AI system inventory

### 2.4 "What demonstration/evidence is needed?" (compliance readiness checklist)

- 🔴 **Not produced at all.** There is no checklist of concrete artifacts the company should be able to produce on demand (e.g., Annex IV technical documentation, risk management file, DPIA, logging retention per Article 12, human oversight procedure, post-market monitoring plan, EU database registration per Article 71, incident-reporting procedure). Today's "obligations" are labels, not actionable, trackable items.
- 🟠 **No status/ownership tracking.** Even if a checklist existed, there's no way to mark an item Not Started / In Progress / Done / Evidence Attached, or attach a document/link as proof.
- 🟡 **No consolidated, shareable report.** Current export (`action=export`, JSON/CSV) is a raw dump of assessment metadata only — there is no single downloadable document combining the Q&A answers, the classification reasoning, and the evidence checklist, which is what someone would actually attach to a review, share with legal, or archive as a point-in-time record.

### 2.5 Cross-cutting / technical gaps

- 🔴 **Persistence will not survive a Vercel deployment (or any stateless host).** `assessment-log.ts` uses `fs.appendFileSync` against a local file. Vercel serverless functions have an ephemeral, largely read-only filesystem — writes vanish between invocations and won't be visible across users/regions. This blocks deployment on Vercel *or any other stateless/serverless host* as-is and must be replaced by a real, externally hosted, persistent database (see §5) regardless of where the app ends up running.
- 🔴 **No audit trail of who ran/approved an assessment, or of checklist status changes over time.** No `assessedBy`/`approvedBy` fields, and no history is kept at all — the current design would overwrite a checklist item's status in place, destroying the change history that governance review actually needs.
- 🟠 **No persistence of in-progress Q&A session state.** Once the form becomes a multi-step interview (§3.1), a user who navigates away mid-interview loses all progress; there's no session concept today.
- 🔴 **No users table or authentication at all.** Anyone who can reach the app can see and submit assessments; there is no login, no concept of "who is using this," and no access control on assessment data, which may contain confidential product descriptions. See §3.7 for the target model.
- 🟡 **Duplicate/orphaned API route file.** `pages/api/assessments/route.ts` uses the App Router `route.ts` convention, which does nothing under Pages Router (the project uses `pages/api/assessments.ts`). Dead code that will confuse future readers.
- 🟡 **Stale packaging docs.** `00_REVIEW_AND_CORRECTIONS.md`, `15_INSTALLATION_AND_DEPLOYMENT.md`, `16_COMPLETE_PACKAGE_SUMMARY.md` reference numbered files (`01_classification-engine.ts`, etc.) that don't exist in the repo — leftover scaffolding from an earlier AI-assisted generation pass. Should be archived or deleted once superseded by this document.
- 🟡 **No rules-currency process.** `rules.yaml` has a `last_reviewed` date but no documented process for tracking EU Commission delegated acts, GPAI Code of Practice updates, or harmonized standards as the Act's provisions phase in through 2027.

---

## 3. Target Solution Design

### 3.1 Adaptive Q&A flow (replaces the static form)

A multi-step, branching questionnaire, not a single page:

1. **Gate question** — Is this even an "AI system" under Article 3(1)? (short guided definition + examples). If no → exit with "not in scope" record.
2. **Product characterization** — structured choice + free text: product type (GPAI/foundation model, embedded component, decision-support tool, chatbot/generative content, recommender/ranking, biometric system, agentic system, other), primary function, who/what it affects.
3. **Role in the value chain** — provider / deployer / importer / distributor / product manufacturer (multi-select — a company can be more than one role for the same system).
4. **Sector & use-case questions** — dynamically shown based on step 2 (e.g., if "biometric" selected, ask the specific Annex III sub-category questions; if "healthcare", ask about clinical decision involvement).
5. **Article 5 screening questions** — direct yes/no questions mapped to each prohibited practice (manipulation, exploitation of vulnerability, social scoring, predictive policing, facial scraping, workplace/education emotion recognition, sensitive biometric categorisation, real-time remote biometric ID), rather than relying on keyword matches in free text.
6. **Article 6(3) exemption questions** — only shown if an Annex III category matched: does it perform a narrow procedural task / improve a completed human activity / detect patterns without materially influencing a decision / do preparatory work? If yes to any and no significant risk of harm → downgrade from presumed-HIGH_RISK, but flag as "exemption claimed — must be documented and justified," not silently downgraded.
7. **Geography, vulnerable groups, cross-border impact** — kept from current form.
8. **Free-text description** — kept, but used as supporting context (and, if an LLM is wired in, as an aid to suggest which structured answers above might apply — never as the sole classification signal).

Each step's answers feed the classification engine as structured input, not string matching.

### 3.2 Classification engine changes

- Implement Article 6(3) exemption check as an explicit step between Annex III matching and final HIGH_RISK assignment; when exemption criteria are met, classify as `LIMITED_RISK` (or a new `EXEMPTED_FROM_HIGH_RISK` label) with the exemption reasoning stored, not silently dropped.
- Add `role` (provider/deployer/importer/distributor) as a required structured input; obligations output must be filtered/labeled per role.
- Add a GPAI systemic-risk sub-classification (ask about training compute / model scale in the questionnaire rather than inferring from keywords).
- Allow multiple simultaneous matches (e.g., Article 5 exact violations are always fatal and returned alone; but Annex III + Article 50 can co-apply) instead of first-match-wins short-circuiting where it isn't legally correct to short-circuit.
- Move away from keyword/Levenshtein matching as the *primary* signal for Annex I/III category detection — matching should confirm/support structured answers, not replace them.

### 3.3 Governance structure output (new)

For each classification result, generate a **governance structure block**:
- Recommended internal owner role(s) (e.g., "AI Governance Committee sign-off required" for HIGH_RISK/UNACCEPTABLE_RISK; "Product owner + Legal review" for LIMITED_RISK; "Product owner self-attestation" for MINIMAL_RISK).
- Required review cadence (pre-launch, periodic re-assessment interval, triggers for re-assessment such as model/data changes).
- Escalation path if classification is UNACCEPTABLE_RISK or a role/exemption is ambiguous.
- Entry into an internal AI system inventory (a new persisted list, separate from the raw assessment log, tracking one row per system over its lifecycle).

This requires a new data structure (`GovernanceRequirement[]`) distinct from the current flat `obligations: string[]`.

### 3.4 Evidence / demonstration checklist output (new)

For each applicable obligation, generate a **checklist item**, not just a label:
```
{
  id, obligationArticle, title, description,
  requiredArtifact: string,        // e.g. "Annex IV technical documentation"
  status: 'not_started' | 'in_progress' | 'done',
  owner: string | null,
  evidenceLink: string | null,
  lastUpdated: string | null
}
```
Checklist items should be persisted per system (not per assessment run) so status can be updated over time without re-running the whole questionnaire.

### 3.5 On-demand PDF report (Q&A + inference + checklist as one document)

A user should be able to download a single PDF, on demand, from a completed (or in-progress) system's record, containing:
- The full Q&A answers as submitted (system details, role, sector questions, Article 5 screening, Article 6(3) exemption answers if shown, geography/vulnerable groups).
- The classification result and reasoning trace (risk category, applicable articles, confidence/evidence strength, why each rule fired).
- The governance structure block (owner, review cadence, escalation path) from §3.3.
- The evidence checklist from §3.4, including current status/owner/evidence links at the time of generation.
- A **generation timestamp** printed on the document itself (not just the underlying data's timestamps), since the checklist/audit state is mutable and the PDF is a point-in-time snapshot — the document should make clear *when* it was produced, distinct from when the assessment was originally run.

This is a read-only export composed from data that already exists once Phase 2/3 (assessment, checklist, audit) are in place — it does not require new source data, only a rendering step. Should be triggerable from the result screen and from a saved system's history view. Filename should include the system name and generation date (e.g., `<systemName>-compliance-record-<YYYY-MM-DD>.pdf`).

Implementation note: use a free/open-source PDF generation approach (e.g., `@react-pdf/renderer` or `pdf-lib` for direct PDF construction, or headless-Chromium print-to-PDF via Puppeteer/`@vercel/og`-style HTML rendering) — no paid PDF service needed, consistent with the "free API services" MVP goal.

### 3.6 Optional LLM-assisted layer

To make the Q&A genuinely conversational (ask smart follow-ups, summarize a free-text description into structured fields, flag ambiguity) without hand-coding every branch:
- Use an LLM call to (a) parse the free-text description into suggested structured answers for the user to confirm/correct, and (b) draft plain-language explanations of why a classification applies.
- The LLM must never be the sole source of the final classification — the deterministic rules engine (Section 3.2) remains the source of truth; the LLM only assists intake and explanation. This preserves auditability (a governance tool whose classification isn't reproducible is a liability).
- See Section 5 for free-tier API candidates.

### 3.7 User & access management (seed user + managed users)

Replaces the current no-auth state with a simple, seed-administered user model — no self-service signup, no third-party auth provider required:

- A **seed user** is provisioned once, out of band, from an email address the business owner supplies (via environment variables at setup time, not hardcoded or committed to the repo).
- The seed user can **create new users** by email + password. Newly created users can then log in with those exact credentials — there is no public registration flow.
- **Confirmed: no SMTP/email integration in this MVP.** There is no "forgot password" email flow and no emailed account-invite links — anything that would require verifying identity by email is out of scope. As a direct consequence, password management is **admin-only, not self-service**: the seed user (the admin) sets a user's initial password at creation and is the only one who can change any user's password thereafter, including resetting their own. Non-seed users log in with credentials communicated to them out of band by the admin and have no in-app "change my password" option in this MVP — if that's needed later, it would require either an SMTP integration for verified self-service reset, or a simple "must change password" flag the admin can set to force a change on next login (without needing email).
- A non-seed user cannot create accounts, cannot view or manage other users, and cannot change any password (including their own) through the app itself.
- Every assessment, checklist change, and audit event (§3.4) should be attributed to the logged-in user's id, not an anonymous or placeholder actor — this makes the audit trail in §5 meaningful.
- Passwords must be hashed (bcrypt/argon2) and never logged or stored in plaintext; this applies to the seed user's own credentials too.

This is deliberately minimal (no roles/permissions beyond "seed" vs. "user," no SSO) — appropriate for an internal MVP with a small, known set of users, not a general-purpose identity system.

---

## 4. Non-Functional Requirements

- **Auditability:** every classification must show its reasoning trace (which rule/question triggered it), not just a final label — required for both governance owner review and later legal review.
- **Reproducibility:** given the same structured answers and the same `rules.yaml` version, the classification must be deterministic.
- **Data sensitivity:** assessment descriptions may contain confidential product information; at minimum, document that this MVP has no auth (see Section 6) and is not for production sensitive-data use until access control is added.
- **Versioning:** every stored assessment must record `rulesVersion`, and rules.yaml changes must bump that version (already implemented — keep it, extend to cover the new structured questions).

---

## 5. Persistence & Free-Tier Database Requirements

Persistence is a **hard requirement independent of hosting platform** — it is not only a Vercel workaround. Three distinct things need to be persisted, and none of them can live in server memory or local disk once this is a shared tool:

1. **Assessment records** (already identified) — the classification result per submitted questionnaire.
2. **In-progress conversation / session state** — once the static form becomes the multi-step adaptive Q&A in §3.1 (and optionally the LLM-assisted intake in §3.6), a user's answers-so-far and any LLM exchange must be saved keyed by a session id, so a partially completed interview can be resumed rather than lost on refresh/navigation, and so the LLM's suggested-vs-confirmed answers are recoverable for review.
3. **Audit trail** — an append-only event log, separate from "current state," recording every change: who ran an assessment, who changed a governance/checklist item's status, from what value to what value, and when. Overwriting a checklist item's `status` field in place (as sketched in §3.4) is not sufficient for governance purposes — the *history* of changes is itself required evidence. This should be its own table/collection (e.g., `audit_events`: `id, entityType, entityId, actorId, action, previousValue, newValue, timestamp`), not reconstructed after the fact.

**Platform independence:** the database choice should not be coupled to Vercel. `fs.appendFileSync`/`fs.readFileSync` in `assessment-log.ts` must be replaced by *any* externally-hosted, connection-string- or REST-accessible datastore — the same store works whether the app is deployed on Vercel, Render, Railway, a company server, or run locally. Vercel KV specifically is Vercel-native, but the Upstash Redis it's built on (and Supabase Postgres, Neon Postgres, MongoDB Atlas) are all reachable from anywhere via a connection string/REST API and have usable free tiers — pick one of those if there's any chance the app moves off Vercel later. Recommendation: a free-tier Postgres (Supabase or Neon) is the best fit here since assessments, sessions, and audit events are naturally relational and you'll want to query/join them (e.g., "show me every status change for this system's checklist").
4. `rules.yaml` can remain a versioned file in the repo (git-tracked, deployed with the app) — no change needed there; it is read-mostly reference data, not user data.
5. **LLM assist (§3.6), if included in MVP**, needs a provider with a usable free tier for low-volume testing. This is a decision point (cost, data-handling terms, latency) that should be made explicitly rather than defaulted, since assessment text may describe internal products.
6. No auth exists today; before deploying anywhere reachable outside the team, decide whether the MVP is behind a shared password/allowlist or genuinely internal-network-only.

---

## 6. Acceptance Criteria for MVP

- [ ] Q&A flow replaces the static form; a user with no EU AI Act knowledge can complete it in under 10 minutes and get a classification with a visible reasoning trace.
- [ ] Article 6(3) exemption logic is applied before any Annex III HIGH_RISK result.
- [ ] Role (provider/deployer/etc.) is captured and reflected in the obligations output.
- [ ] Every result includes: risk classification, applicable articles, a governance-structure block (owner, cadence, escalation), and an evidence checklist (status-trackable, not just a label list).
- [ ] Assessment data, in-progress Q&A sessions, and audit events all persist in an externally hosted database (not local-file-only) — verified working both locally and when deployed.
- [ ] Every checklist status change and every assessment run is recorded as an immutable audit event (actor, timestamp, before/after value), independently queryable from current-state views.
- [ ] A user can download a single timestamped PDF per system combining the Q&A answers, classification/inference reasoning, and evidence checklist status as of generation time.
- [ ] A seed user (provisioned from a supplied email) can log in, create other users by email + password, and change any user's password (including their own); a non-seed user cannot create users, cannot change any password (their own or another's), and has no SMTP-dependent reset flow (verified by test).
- [ ] Existing 93+ tests still pass; new tests cover the exemption logic and role-based obligation filtering.
- [ ] Stale numbered docs (`00_`, `15_`, `16_...md`) are archived/removed once superseded.

---

*See `ACTION_PLAN.md` for the phased implementation plan derived from this document.*
