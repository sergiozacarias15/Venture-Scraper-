# Venture Sports USA — Volleyball Assessment

A standalone, mobile-first international volleyball recruiting assessment built with Vite, React, TypeScript, React Router, React Hook Form, Zod, Tailwind CSS, shadcn-style UI primitives, i18next, and Supabase.

## Local preview

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:5173/sergiozacarias`. The default submission mode is `mock`: completed assessments are saved only in the current browser under the localStorage key `venture-volleyball-mock-submissions`.

## Languages

The browser language is detected automatically, English is the fallback, and the visitor can override it with the selector in the header. The selection is remembered in localStorage.

Translations live in `src/locales/{language}.json`. To add a language:

1. Copy `src/locales/en.json` and translate every value without changing its keys.
2. Import the file and add its language code and label in `src/i18n.ts`.

## Visual assets

The volleyball hero image in `public/media/volleyball-hero-action.webp` is an original AI-generated project asset with no third-party team, athlete, university, sponsor, or stock-library branding. It can be replaced later without changing the hero or advisor-card layout. The Venture logo files under `public/brand` are kept unmodified.

## Connect Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local`.
4. Set `VITE_SUPABASE_URL` and the public `VITE_SUPABASE_ANON_KEY`.
5. Set `VITE_SUBMISSION_MODE=supabase`.
6. Restart the development server and submit a test assessment.

The included policy allows anonymous inserts but blocks anonymous reads, updates, and deletes. Before a public production launch, route submissions through a Supabase Edge Function and add CAPTCHA, server-side validation, rate limiting, retention rules, restricted staff access, and the organization’s final legal privacy notice.

The submission payload includes:

- `sport: "Volleyball"`
- `agent: "Sergio Zacarias"`
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
npm run preview
```
