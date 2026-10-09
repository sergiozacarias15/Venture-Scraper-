import { getVolleyboxMode } from "./env";

type Env = Record<string, string | undefined>;
export type Check = { key: string; label: string; ok: boolean; required: boolean; how: string };
export type Capability = { name: string; state: "working" | "mock" | "not_connected"; detail: string };

/** Everything needed to activate live Volleybox access, evaluated against the current environment. */
export function liveActivationChecklist(env: Env = process.env): Check[] {
  return [
    { key: "authorization", label: "Written authorization from Volleybox (API/data-partner access that permits search and messaging)", ok: false, required: true,
      how: "Cannot be detected by the app. Obtain it from Volleybox first; do not enable live mode without it." },
    { key: "mode", label: "VOLLEYBOX_MODE=live", ok: env.VOLLEYBOX_MODE === "live", required: true, how: "Set VOLLEYBOX_MODE=live on the server." },
    { key: "url", label: "VOLLEYBOX_API_BASE_URL", ok: !!env.VOLLEYBOX_API_BASE_URL, required: true, how: "Base URL of the API Volleybox gives you." },
    { key: "key", label: "VOLLEYBOX_API_KEY", ok: !!env.VOLLEYBOX_API_KEY, required: true, how: "API credential issued to your account." },
    { key: "contract", label: "Adapters match Volleybox's real API contract", ok: false, required: true,
      how: "Edit src/modules/discovery/adapters/http.ts and src/modules/messaging/adapters/http.ts (paths, fields, auth, error codes) to the documentation you receive, then run the tests." },
    { key: "webhook", label: "VOLLEYBOX_WEBHOOK_SECRET (inbound replies)", ok: !!env.VOLLEYBOX_WEBHOOK_SECRET, required: false,
      how: "Needed only if Volleybox pushes replies: point it at POST /api/webhooks/volleybox and sign the raw body with HMAC-SHA256 in x-signature. Otherwise implement polling in fetchReplies, or log replies manually." },
    { key: "conversation", label: "VOLLEYBOX_CONVERSATION_URL_TEMPLATE (deep links)", ok: !!env.VOLLEYBOX_CONVERSATION_URL_TEMPLATE, required: false,
      how: "Optional, e.g. https://volleybox.net/messages/{thread_id}. Without it the profile link is used." },
    { key: "limits", label: "Daily cap / schedule set within Volleybox's messaging limits", ok: false, required: true,
      how: "In Settings, keep the daily cap, minimum gap and sending window at or below what Volleybox permits. The app also pauses on any rate-limit/CAPTCHA response." },
    { key: "cron", label: "Background jobs running (CRON_SECRET + Vercel Cron, or npm run worker)", ok: !!env.CRON_SECRET, required: true, how: "Set CRON_SECRET and deploy vercel.json, or run the worker process." },
    { key: "alerts", label: "ALERT_WEBHOOK_URL (push alerts when an athlete is interested)", ok: !!env.ALERT_WEBHOOK_URL, required: false, how: "Optional Slack-compatible incoming webhook." },
  ];
}

export function capabilities(env: Env = process.env): Capability[] {
  const live = getVolleyboxMode(env).mode === "live";
  const adapterState: Capability["state"] = live ? "working" : "mock";
  const adapterNote = live ? "Live adapter active (contract must match Volleybox's API)." : "Mock adapter: synthetic data, nothing contacts Volleybox.";
  return [
    { name: "Athlete database, filters, dedupe, CSV import", state: "working", detail: "Fully functional; CSV import accepts any authorized export." },
    { name: "Discovery search (Volleybox)", state: adapterState, detail: adapterNote },
    { name: "Message drafting (EN/IT/ES/PT), minor safeguards, approval", state: "working", detail: "Fully functional." },
    { name: "Queue: schedule, caps, retries, duplicate + suppression checks", state: "working", detail: "Fully functional and tested." },
    { name: "Sending messages through Volleybox", state: adapterState, detail: adapterNote },
    { name: "Receiving replies from Volleybox", state: live && env.VOLLEYBOX_WEBHOOK_SECRET ? "working" : "mock",
      detail: live ? "Webhook endpoint ready; needs VOLLEYBOX_WEBHOOK_SECRET and Volleybox pushing to it." : "Use 'Log a reply' on the athlete page, or the signed webhook for testing." },
    { name: "Reply classification, suppression, follow-up stop, alerts, leads", state: "working", detail: "Fully functional for EN/IT/ES/PT." },
    { name: "Browser automation of Volleybox", state: "not_connected", detail: "Intentionally not built. Not used unless Volleybox expressly permits it." },
    { name: "Pipedrive sync", state: "not_connected", detail: "Database columns and payload mapper only; no API calls yet." },
    { name: "Instagram / WhatsApp", state: "not_connected", detail: "Not integrated by design: you continue those conversations personally; the app only records that you moved." },
    { name: "AI scouting / automatic sales conversations", state: "not_connected", detail: "Out of scope for this version." },
  ];
}
