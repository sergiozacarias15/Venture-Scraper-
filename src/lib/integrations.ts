import { getVolleyboxMode } from "./env";

type Env = Record<string, string | undefined>;
export type Capability = { name: string; state: "working" | "assisted" | "demo" | "unavailable"; detail: string };

/** Single source of truth for the Integrations page. Nothing here claims an API that does not exist. */
export function capabilities(env: Env = process.env): Capability[] {
  const demo = getVolleyboxMode(env).mode === "demo";
  return [
    { name: "Athlete database, filters, dedupe, CSV import", state: "working", detail: "Real data you import. Unique on profile URL; suppressed profiles are never re-added." },
    { name: "Discovering athletes on Volleybox automatically", state: demo ? "demo" : "unavailable",
      detail: demo ? "Demo mode generates synthetic athletes." : "Not available: Volleybox publishes no API, and its terms prohibit scraping/harvesting without permission. Import athletes instead." },
    { name: "Message drafting (EN/IT/ES/PT), minor safeguards, approval", state: "working", detail: "Real. Drafts use your imported athletes' data." },
    { name: "Sending messages on Volleybox", state: demo ? "demo" : "assisted",
      detail: demo ? "Demo mode records fake sends." : "Assisted: you send each approved message in Volleybox's own message form, then confirm here. Daily cap, minimum gap, suppression and duplicate checks are enforced on confirm." },
    { name: "Receiving replies from Volleybox", state: "assisted", detail: "No inbound feed exists. Paste or log each reply on the athlete page; it is classified, suppressions applied and leads/alerts created." },
    { name: "Reply classification, suppression, follow-up stop, alerts, leads", state: "working", detail: "Real, for EN/IT/ES/PT replies." },
    { name: "Follow-ups and No Response tracking", state: "working", detail: "Follow-up drafts appear in the same ready-to-send list; the sequence stops on any reply or decline." },
    { name: "Browser automation / scraping of Volleybox", state: "unavailable", detail: "Not built and not planned: prohibited by Volleybox's terms and protected by a bot challenge." },
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
