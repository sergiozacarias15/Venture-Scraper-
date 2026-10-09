import { getVolleyboxMode } from "./env";

type Env = Record<string, string | undefined>;
export type Capability = { name: string; state: "working" | "assisted" | "demo" | "unavailable"; detail: string };

/** Single source of truth for the Integrations page. Nothing here claims an API that does not exist. */
export function capabilities(env: Env = process.env): Capability[] {
  const demo = getVolleyboxMode(env).mode === "demo";
  return [
    { name: "Athlete database, filters, dedupe, CSV import", state: "working", detail: "Real data you import. Unique on profile URL; suppressed profiles are never re-added." },
    { name: "Discovery on Volleybox's ranking page (volleybox.net/players/ranking)", state: demo ? "demo" : "assisted",
      detail: demo ? "Demo mode generates synthetic athletes." : "Assisted: each birth year x country x section becomes a pass. You set the page's filters, review the players and paste them in; the app filters, dedupes and tracks the passes. Automatic reading of the page is not authorized and not built." },
    { name: "Message drafting (EN/IT/ES/PT), minor safeguards, approval", state: "working", detail: "Real. Drafts use your imported athletes' data." },
    { name: "Sending in Volleybox's private-message inbox", state: demo ? "demo" : "assisted",
      detail: demo ? "Demo mode records fake sends." : "Assisted: you paste each approved message into Volleybox's composer and press its send button, then confirm here with the /pm/inbox/{id} link. Daily cap, minimum gap, suppression and duplicate checks are enforced on confirm." },
    { name: "Reading replies in the inbox", state: "assisted", detail: "No inbound feed is available to the app. The Inbox's 'To check' list opens each stored conversation link; you paste any reply back, and it is classified, suppressions applied and leads/alerts created." },
    { name: "Reply classification, suppression, follow-up stop, alerts, leads", state: "working", detail: "Real, for EN/IT/ES/PT replies." },
    { name: "Follow-ups and No Response tracking", state: "working", detail: "Follow-up drafts appear in the same ready-to-send list; the sequence stops on any reply or decline." },
    { name: "Automated access to the ranking page or inbox (API, browser automation, scraping)", state: "unavailable", detail: "Not built, not tested, and not authorized. Volleybox's terms prohibit scraping without permission and the site uses a bot challenge. Becomes possible only with written permission." },
    { name: "Pipedrive sync", state: "unavailable", detail: "Database columns and payload mapper only; no API calls yet." },
    { name: "Instagram / WhatsApp", state: "assisted", detail: "You continue those conversations personally; the app records that you moved the conversation." },
  ];
}

/** What would have to be true before any part of Volleybox access could be automated. */
export const AUTOMATION_REQUIREMENTS = [
  "Written permission from Volleybox (admin@volleybox.net) for programmatic access to profiles and/or messaging. A draft request is in docs/volleybox-access-request.md.",
  "Technical documentation and credentials from Volleybox (endpoints, authentication, rate limits, data-use terms). None are public today.",
  "Implement adapters against that documentation: DiscoveryAdapter (src/modules/discovery/types.ts) and MessagingAdapter (src/modules/messaging/adapters/types.ts). The rest of the app (queue, caps, suppression, classification, leads) already depends only on those interfaces.",
  "Map Volleybox's own limit/CAPTCHA/restriction responses to SendBlockedError so sending pauses and is never retried around.",
];
