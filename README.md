# Venture Volleybox Outreach

Discovery and outreach automation for recruiting international volleyball athletes to Venture Sports USA.
Next.js (App Router) + TypeScript + Tailwind + Supabase (Postgres).

> **Compliance first.** The app only talks to Volleybox through *adapters* backed by an authorized
> integration. There is no scraping, no login automation and no CAPTCHA handling. Without an
> authorized integration it runs on **mock adapters** (synthetic athletes, nothing delivered) and says so
> on every page. If Volleybox answers with a rate limit, CAPTCHA or account restriction, sending pauses
> and you are alerted; the app never retries around it.

## What it does

| Area | Module | Notes |
|---|---|---|
| Discovery | `src/modules/discovery` | Criteria (birth years, gender, nationality, position) chosen in the dashboard; scheduled job pulls pages from the adapter, normalizes, filters strictly, dedupes on profile URL / Volleybox id, skips suppressed profiles, never changes the status of already-known athletes. CSV import for authorized exports. |
| Messaging | `src/modules/messaging` | EN/IT/ES/PT templates (language = athlete preference, else nationality default, else EN). Persistent queue with approval, schedule window, rolling-24h cap, minimum gap, retries with backoff, send-time re-checks (suppression, duplicates, age). |
| Responses | `src/modules/responses` | Inbound via webhook / polling / manual logging. Multilingual rule-based classifier: Interested, Not interested, Question; "No response" is derived after the follow-up sequence goes unanswered. Declines and opt-outs auto-suppress and stop follow-ups. Interested replies create a lead and an alert. |
| Leads | `src/modules/leads` | Lead pipeline, links to the Volleybox profile and conversation, "moved to WhatsApp/Instagram" tracking, Pipedrive-ready columns and payload mapper (no API calls yet). |
| Jobs | `src/modules/jobs` | Postgres-backed queue (`jobs` table, `FOR UPDATE SKIP LOCKED`), dedupe keys, exponential retry, dead-letter + alert, stale-job recovery, recurring scheduler. |

### Safeguards for minors

Birth year alone does not prove age, so anyone who *might* be under 18 is treated as a minor:

- every message requires your explicit approval (never auto-approved, never bulk-approved);
- templates are guardian-aware (invite sharing with a parent/guardian) and never ask for WhatsApp/Instagram;
- moving a potential minor to WhatsApp/Instagram is blocked until you record how a parent/guardian was involved;
- athletes who cannot be at least `min_contact_age` (default 16) or whose age cannot be verified are excluded.

### Guarantees against duplicate / unwanted outreach

- Unique partial index: one live intro message per athlete (enforced by the database).
- Every send re-checks suppression list, athlete status, prior contact and age at send time.
- Declines, opt-outs, manual suppressions and "moved off-platform" cancel all queued messages and stop follow-ups.
- Suppressed profile URLs are skipped on future imports. Explicit opt-outs can't be lifted from the UI.

## Run it locally (no Docker)

```bash
npm install
cp .env.example .env.local        # set ADMIN_PASSWORD, CRON_SECRET
npm run dev:db                    # embedded Postgres on :5433 (PGlite), applies supabase/migrations
# in .env.local: SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres  and  DB_POOL_MAX=1
npm run dev                       # http://localhost:3000
npm run worker                    # optional: runs the job tick every 30s (or use "Run background jobs now")
```

Walkthrough: **Settings** (set your sender name) -> **Discovery** (pick years/countries, "Run discovery now") ->
**Outreach queue** ("Generate drafts now", review, approve) -> turn on **Send automatically** in Settings ->
**Inbox** / athlete page ("Log a reply") -> **Leads**.

## Deploy with Supabase

1. Create a Supabase project and run the migration: `supabase db push`, or `npm run db:migrate` with `SUPABASE_DB_URL` set.
2. Set the env vars from `.env.example` on your host (Vercel). Use Supabase's **pooled** connection string for `SUPABASE_DB_URL`.
   All tables have RLS enabled with no policies, so the anon key cannot read anything; the server connects directly.
3. Background jobs: `vercel.json` registers Vercel Cron for `GET /api/cron/tick` every minute (it sends `Authorization: Bearer $CRON_SECRET`).
   Alternatives: `npm run worker` on any VM, or a Supabase `pg_cron` + `pg_net` call to the same endpoint.
4. Sign in with `ADMIN_PASSWORD`. The dashboard fails closed in production if it is unset.

## Connecting a real Volleybox integration

Live mode needs **all** of: `VOLLEYBOX_MODE=live`, `VOLLEYBOX_API_BASE_URL`, `VOLLEYBOX_API_KEY`. Until then the app stays in mock mode.

- `src/modules/discovery/adapters/http.ts` and `src/modules/messaging/adapters/http.ts` implement an *assumed* partner-API contract
  (documented in the files). **Align the paths and field names with the contract in your agreement with Volleybox** - they are the
  only two places to change. Policy responses (429 / captcha / restricted account) map to `SendBlockedError`, which pauses sending.
- Inbound replies: push to `POST /api/webhooks/volleybox` (HMAC-SHA256 of the raw body in `x-signature`, secret `VOLLEYBOX_WEBHOOK_SECRET`)
  and/or implement `fetchReplies` for polling.
- Set `VOLLEYBOX_CONVERSATION_URL_TEMPLATE` (e.g. `https://volleybox.net/messages/{thread_id}`) for deep links to conversations.
- Alerts: set `ALERT_WEBHOOK_URL` (Slack-compatible) to be pinged when an athlete is interested or sending is paused.

## Pipedrive (prepared, not connected)

`leads` has `pipedrive_person_id`, `pipedrive_deal_id`, `pipedrive_sync_status`, `pipedrive_synced_at`; `toPipedrivePayload()` in
`src/modules/leads/pipedrive.ts` defines the person/deal/note mapping. A sync job can be added to `HANDLERS` without schema changes.

## Tests

```bash
npm test          # unit + integration tests; integration tests run the real SQL migrations in-process via PGlite
npm run typecheck
```

## Not built (by design)

AI scouting, automatic sales conversations, scraping or browser automation of Volleybox, and anything that circumvents Volleybox's
access controls, messaging limits or anti-spam protections.
