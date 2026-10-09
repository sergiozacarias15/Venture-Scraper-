import type { Db } from "@/lib/db";
import { logEvent } from "@/lib/logger";
import { isPotentialMinor } from "@/modules/messaging/safeguards";
import { stopAutomation } from "@/modules/messaging/suppression";

export type LeadStatus = "new" | "in_conversation" | "moved_whatsapp" | "moved_instagram" | "qualified" | "closed_won" | "closed_lost";
export const LEAD_STATUSES: LeadStatus[] = ["new", "in_conversation", "moved_whatsapp", "moved_instagram", "qualified", "closed_won", "closed_lost"];

export class GuardianConsentRequired extends Error {
  constructor() {
    super("This athlete may be under 18. Record guardian involvement before moving the conversation to WhatsApp or Instagram.");
  }
}

export async function ensureLead(db: Db, athleteId: string) {
  await db.query("insert into leads (athlete_id) values ($1) on conflict (athlete_id) do nothing", [athleteId]);
}

export async function markMovedOffPlatform(db: Db, athleteId: string, channel: "whatsapp" | "instagram", now = new Date()) {
  const [athlete] = await db.query<{ birth_year: number | null; birth_date: string | null }>(
    "select birth_year, birth_date from athletes where id = $1", [athleteId]);
  if (!athlete) throw new Error("Athlete not found");
  await ensureLead(db, athleteId);
  const [lead] = await db.query<{ guardian_consent_at: Date | null }>("select guardian_consent_at from leads where athlete_id = $1", [athleteId]);
  if (isPotentialMinor(athlete, now) && !lead.guardian_consent_at) throw new GuardianConsentRequired();
  await db.query(
    "update leads set status = $2, off_platform_channel = $3, moved_at = $4, updated_at = now() where athlete_id = $1",
    [athleteId, channel === "whatsapp" ? "moved_whatsapp" : "moved_instagram", channel, now],
  );
  await stopAutomation(db, athleteId, `moved to ${channel}`);
  await logEvent(db, "info", "leads", `Conversation moved to ${channel}`, { athleteId });
}

export async function recordGuardianConsent(db: Db, athleteId: string, note: string) {
  await ensureLead(db, athleteId);
  await db.query("update leads set guardian_consent_at = now(), guardian_note = $2, updated_at = now() where athlete_id = $1", [athleteId, note.trim() || null]);
  await logEvent(db, "info", "leads", "Guardian involvement recorded", { athleteId });
}

export async function updateLead(db: Db, athleteId: string, patch: { status?: LeadStatus; notes?: string }) {
  await ensureLead(db, athleteId);
  if (patch.status) {
    if (!LEAD_STATUSES.includes(patch.status)) throw new Error("Invalid lead status");
    if ((patch.status === "moved_whatsapp" || patch.status === "moved_instagram")) {
      return markMovedOffPlatform(db, athleteId, patch.status === "moved_whatsapp" ? "whatsapp" : "instagram");
    }
    await db.query("update leads set status = $2, updated_at = now() where athlete_id = $1", [athleteId, patch.status]);
  }
  if (patch.notes !== undefined) {
    await db.query("update leads set notes = $2, updated_at = now() where athlete_id = $1", [athleteId, patch.notes]);
  }
}
