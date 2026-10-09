import type { Db } from "@/lib/db";
import { logEvent } from "@/lib/logger";

export type SuppressionReason = "declined" | "opt_out" | "manual" | "complaint" | "guardian_request";

/** Cancels every unsent outbound message and halts the conversation's automation. */
export async function stopAutomation(db: Db, athleteId: string, reason: string, opts: { cancelIntro?: boolean } = {}) {
  const kinds = opts.cancelIntro === false ? "('followup','reply')" : "('intro','followup','reply')";
  await db.query(
    `update messages set status = 'cancelled', last_error = $2, updated_at = now()
     where athlete_id = $1 and direction = 'out' and kind in ${kinds}
       and status in ('pending_approval','approved')`,
    [athleteId, `Cancelled: ${reason}`],
  );
  await db.query(
    `update conversations set status = 'stopped', stop_reason = $2, updated_at = now()
     where athlete_id = $1 and status = 'active'`,
    [athleteId, reason],
  );
}

/**
 * Adds the athlete's profile to the suppression list (never contacted again, never re-imported)
 * and stops all pending automation for them.
 */
export async function suppressAthlete(
  db: Db,
  athleteId: string,
  reason: SuppressionReason,
  opts: { source?: "auto" | "manual" | "system"; note?: string } = {},
) {
  const [athlete] = await db.query<{ profile_url: string }>("select profile_url from athletes where id = $1", [athleteId]);
  if (!athlete) throw new Error("Athlete not found");
  await db.query(
    `insert into suppressions (athlete_id, profile_url, reason, source, note) values ($1,$2,$3,$4,$5)
     on conflict (profile_url) do update set reason = excluded.reason, note = coalesce(excluded.note, suppressions.note)`,
    [athleteId, athlete.profile_url, reason, opts.source ?? "system", opts.note ?? null],
  );
  await db.query("update athletes set status = 'suppressed', updated_at = now() where id = $1", [athleteId]);
  await stopAutomation(db, athleteId, `suppressed (${reason})`);
  await logEvent(db, "info", "suppression", `Suppressed athlete (${reason})`, { athleteId });
}

/** Suppress a profile URL that has not been imported yet (e.g. a "do not contact" list). */
export async function suppressProfileUrl(db: Db, profileUrl: string, reason: SuppressionReason, note?: string) {
  await db.query(
    `insert into suppressions (profile_url, reason, source, note) values ($1,$2,'manual',$3)
     on conflict (profile_url) do nothing`,
    [profileUrl, reason, note ?? null],
  );
  const rows = await db.query<{ id: string }>("select id from athletes where profile_url = $1", [profileUrl]);
  if (rows[0]) await suppressAthlete(db, rows[0].id, reason, { source: "manual", note });
}

export async function liftSuppression(db: Db, athleteId: string) {
  await db.query("delete from suppressions where athlete_id = $1 and reason <> 'opt_out'", [athleteId]);
  const left = await db.query("select 1 from suppressions where athlete_id = $1", [athleteId]);
  if (!left.length) {
    await db.query(
      "update athletes set status = case when first_contacted_at is null then 'discovered' else 'replied' end, updated_at = now() where id = $1 and status = 'suppressed'",
      [athleteId],
    );
  }
}
