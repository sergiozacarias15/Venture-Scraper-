# Venture Sports USA — Volleyball Assessment

A standalone, mobile-first international volleyball recruiting assessment built with Vite, React, TypeScript, React Router, React Hook Form, Zod, Tailwind CSS, shadcn-style UI primitives, i18next, Vercel Functions, and Pipedrive.

## Local preview

```bash
npm install
npm run dev
```

Open `http://localhost:5173/sergiozacarias`. Vite previews the frontend; production submissions require the Vercel Function and its server-only environment variables. In-progress answers are retained in localStorage under `venture-volleyball-assessment-draft` and removed only after Pipedrive confirms the deal and note.

## Languages

The browser language is detected automatically, English is the fallback, and the visitor can override it with the selector in the header. The selection is remembered in localStorage.

Translations live in `src/locales/{language}.json`. To add a language:

1. Copy `src/locales/en.json` and translate every value without changing its keys.
2. Import the file and add its language code and label in `src/i18n.ts`.

## Visual assets

The volleyball hero image in `public/media/volleyball-hero-action.webp` is an original AI-generated project asset with no third-party team, athlete, university, sponsor, or stock-library branding. It can be replaced later without changing the hero or advisor-card layout. The Venture logo files under `public/brand` are kept unmodified.

## Pipedrive production integration

`POST /api/submit-assessment` validates the complete payload server-side, checks the configured pipeline/stage, finds or creates a Person, prevents duplicate application Deals, creates the Deal, and attaches the formatted assessment note. It sends the API token only in Pipedrive's `x-api-token` server-to-server header.

Required Vercel environment variables:

```dotenv
PIPEDRIVE_API_TOKEN=your_server_only_api_token
PIPEDRIVE_COMPANY_DOMAIN=your_company_subdomain
PIPEDRIVE_OWNER_ID=the_numeric_user_id_for_sergio_zacarias
PIPEDRIVE_PIPELINE_ID=2
```

`PIPEDRIVE_STAGE_ID` is optional. When supplied, it must identify the stage named exactly `NEW PLAYER (LEAD)` in pipeline `2`. When omitted, the endpoint securely fetches the stages in pipeline `2`, resolves that exact name, and caches its numeric ID for 30 minutes on warm serverless instances. A missing or ambiguous match returns a configuration error before any Person or Deal is created.

Do not prefix any variable with `VITE_`. Set credentials for Production (and Preview only if you intentionally want preview submissions connected to a non-production test account).

The endpoint includes strict Zod validation, same-origin enforcement, a honeypot and minimum-completion-time check, request-size limits, per-IP in-memory throttling, client idempotency, durable Pipedrive deal duplicate checks, escaped HTML notes, API timeouts, and deal rollback when note creation fails.

The submission payload includes:

- sport: Volleyball
- Deal owner: Sergio Zacarias, via `PIPEDRIVE_OWNER_ID`
- selected/detected language
- voluntarily entered country of residence
- marketing source
- submission timestamp and source route
- all athlete, volleyball, academic, video, budget, guardian, and consent answers

## Commands

```bash
npm run dev
npm run build
npm run lint
npm test
npm run preview
```
