# Venture Volleybox Outreach

Discovery and outreach automation for recruiting international volleyball athletes to Venture Sports USA.
Next.js (App Router) + TypeScript + Tailwind + Supabase (Postgres).

> **Honest status.** Volleybox publishes no API, data licence or partner program (see "Research findings"), and its
> Terms prohibit scraping or harvesting data without permission. So this app does **not** automate Volleybox.
> It is an **assisted-outreach** tool: you import athletes you are entitled to use, the app drafts and queues
> personalized messages with caps and safeguards, **you send each one on Volleybox** and confirm it here, and
> everything after that (replies, suppression, follow-ups, leads) is tracked. `VOLLEYBOX_MODE=demo` swaps in
> synthetic data for trying the app.

## Research findings (Oct 2026)

Checked: volleybox.net home, `/terms`, `/contact`, `/what-is-volleybox`, `robots.txt`, the public change log, and web search for an API, developer, data-licence or partner program.

- **No official API, developer portal, data licence or partner integration is published.** Contact is a web form / `admin@volleybox.net`.
  This does not prove none exists privately; the only way to find out is to ask (draft in `docs/volleybox-access-request.md`).
- **Terms of Use section 8**: users may not "scrape or harvest data without permission" or "attempt to bypass security measures".
  `robots.txt` allows crawling, but the Terms still govern. Pages beyond the home page also sit behind a Cloudflare bot challenge for scripted requests; this app does not and will not try to get around it.
- **Messaging**: Volleybox has member-to-member private messages. Recipients control who may message them by user group (fans, players, scouts, coaches) and can block individual users, so some athletes cannot be messaged by you at all. No messaging API is documented and no send limits are published.
- **Minors**: the Terms allow users aged 13-17 only under parental/guardian supervision, which matters for the 2008-2010 birth years.
- Unrelated "volleyball API" vendors (livescore/fixtures data) exist, but they do not provide Volleybox player-profile or messaging access.

## What it does

| Area | Module | Notes |
|---|---|---|
| Discovery | `src/modules/discovery` | Criteria (birth years, gender, nationality, position) chosen in the dashboard. CSV import normalizes, filters strictly, dedupes on profile URL / Volleybox id, skips suppressed profiles, never changes the status of already-known athletes. A synthetic source exists for demo mode only. |
| Messaging | `src/modules/messaging` | EN/IT/ES/PT templates (language = athlete preference, else nationality default, else EN). Persistent queue with approval, rolling-24h cap, minimum gap, send-time re-checks (suppression, duplicates, age). Assisted mode: manual send + confirm. Demo mode: automatic fake sends with retries/backoff. |
| Responses | `src/modules/responses` | Replies are logged manually (no inbound feed exists). Multilingual rule-based classifier: Interested, Not interested, Question; "No response" is derived after the follow-up sequence goes unanswered. Declines and opt-outs auto-suppress and stop follow-ups. Interested replies create a lead and an alert. |
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

To try it with synthetic data set `VOLLEYBOX_MODE=demo`.

## Deploy with Supabase

1. Create a Supabase project and run the migration: `supabase db push`, or `npm run db:migrate` with `SUPABASE_DB_URL` set.
2. Set the env vars from `.env.example` on your host (Vercel). Use Supabase's **pooled** connection string for `SUPABASE_DB_URL`.
   All tables have RLS enabled with no policies, so the anon key cannot read anything; the server connects directly.
3. Background jobs: `vercel.json` registers Vercel Cron for `GET /api/cron/tick` every minute (it sends `Authorization: Bearer $CRON_SECRET`).
   Alternatives: `npm run worker` on any VM, or a Supabase `pg_cron` + `pg_net` call to the same endpoint.
4. Sign in with `ADMIN_PASSWORD`. The dashboard fails closed in production if it is unset.

## What works, what is manual, what is unavailable

| Capability | Status |
|---|---|
| Athlete database, filters, dedupe, CSV import | **Working** (real data you import) |
| Draft messages (EN/IT/ES/PT), minor safeguards, approval, editing | **Working** |
| Ready-to-send list: open profile, copy text, confirm "I sent it"; daily cap, minimum gap, suppression/duplicate/age checks on confirm; pause when Volleybox limits you | **Working** (the send itself is manual) |
| Replies | **Manual**: paste/log each reply on the athlete page; classified (Interested / Question / Not interested), suppression, follow-up stop, alerts, leads |
| Follow-ups and No Response | **Working** (follow-up drafts join the ready-to-send list) |
| Lead pipeline, "moved to WhatsApp/Instagram", guardian gate for minors | **Working** |
| Automatic discovery on Volleybox | **Unavailable** (no API; scraping prohibited). Demo mode only |
| Automatic sending / reply capture on Volleybox | **Unavailable** |
| Pipedrive sync | **Not connected** (columns + mapper only) |
| Browser automation of Volleybox, AI scouting, automatic sales conversations | **Not built** |

The same table is at `/integrations`.

## Recommended workflow (assisted)

1. **Settings**: set your name, daily cap and minimum gap (stay conservative; Volleybox publishes no limits).
2. **Discovery**: choose birth years, gender, nationalities, positions. Review candidates in your own Volleybox account and import the ones you intend to contact (CSV; only data you are permitted to use). Imports are filtered by your criteria and deduped; suppressed profiles are skipped.
3. **Outreach -> Awaiting approval**: review drafts (potential minors always need your explicit approval).
4. **Outreach -> Ready to send**: for each message click *Open profile*, *Copy message*, send it in Volleybox, then *I sent it*. Use *Can't message* if the athlete does not accept your messages, or *Volleybox limited me* if you see a CAPTCHA/limit (sending pauses 24h).
5. **Replies**: on the athlete page, *Log a reply*. Interested athletes become leads with an alert; decliners are suppressed and follow-ups stop.
6. **Leads**: continue personally on Instagram/WhatsApp and record it (minors need recorded guardian involvement first).

## How to get to real automation

Only through Volleybox. See `docs/volleybox-access-request.md`. If Volleybox grants access and documents it, implement `DiscoveryAdapter`
(`src/modules/discovery/types.ts`) and `MessagingAdapter` (`src/modules/messaging/adapters/types.ts`) against *their* documentation, map their
limit/CAPTCHA responses to `SendBlockedError`, and add a mode for it. The queue, caps, suppression, classification and lead logic already depend only on those interfaces.

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
