import type { Db } from "./db";
import { errMessage, logEvent } from "./logger";

export type AlertKind = "interested" | "question" | "sending_paused" | "send_failed" | "job_dead" | "info";

/** Persists an alert for the dashboard and best-effort forwards it to ALERT_WEBHOOK_URL (Slack-compatible). */
export async function createAlert(
  db: Db,
  a: { kind: AlertKind; title: string; body?: string; athleteId?: string | null; messageId?: string | null },
  fetchImpl: typeof fetch = fetch,
) {
  const [row] = await db.query<{ id: string }>(
    "insert into alerts (kind, title, body, athlete_id, message_id) values ($1,$2,$3,$4,$5) returning id",
    [a.kind, a.title, a.body ?? null, a.athleteId ?? null, a.messageId ?? null],
  );
  const hook = process.env.ALERT_WEBHOOK_URL;
  if (hook) {
    try {
      const base = process.env.APP_BASE_URL?.replace(/\/$/, "");
      const link = a.athleteId && base ? `\n${base}/athletes/${a.athleteId}` : "";
      const res = await fetchImpl(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `*${a.title}*${a.body ? `\n${a.body}` : ""}${link}` }),
      });
      if (!res.ok) throw new Error(`webhook responded ${res.status}`);
      await db.query("update alerts set notified_at = now() where id = $1", [row.id]);
    } catch (err) {
      await logEvent(db, "warn", "alerts", `Alert webhook failed: ${errMessage(err)}`);
    }
  }
  return row.id;
}
