"use server";

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { isValidTimeZone } from "@/lib/time";
import { errMessage } from "@/lib/logger";
import { getSettings, updateSettings, type Settings } from "@/lib/settings";
import { SESSION_COOKIE, sessionSecret, signSession } from "@/lib/session";
import { parseAthleteCsv } from "@/modules/discovery/adapters/csv";
import { ingestAthletes } from "@/modules/discovery/service";
import { markMovedOffPlatform, recordGuardianConsent, updateLead, type LeadStatus } from "@/modules/leads/service";
import {
  approveMessages, cancelMessage, planFollowups, planIntros, restoreAthlete, resumeSending, updateDraftBody,
} from "@/modules/messaging/service";
import { liftSuppression, suppressAthlete, suppressProfileUrl } from "@/modules/messaging/suppression";
import { normalizeProfileUrl } from "@/modules/discovery/normalize";
import { defaultDeps } from "@/modules/jobs/handlers";
import { enqueueJob } from "@/modules/jobs/queue";
import { runDueJobs, tick } from "@/modules/jobs/runner";
import { ingestInbound, reclassifyMessage } from "@/modules/responses/service";
import type { ReplyCategory } from "@/modules/responses/classifier";

function withParam(path: string, key: string, value: string) {
  const [base, query = ""] = path.split("?");
  const q = new URLSearchParams(query);
  q.set(key, value);
  return `${base}?${q.toString()}`;
}

/** Runs a mutation, then redirects back with a success or error message (redirect must happen outside try/catch). */
async function run(returnTo: string, fn: () => Promise<string | void>) {
  let target: string;
  try {
    const ok = await fn();
    target = ok ? withParam(returnTo, "ok", ok) : returnTo;
  } catch (err) {
    target = withParam(returnTo, "error", errMessage(err));
  }
  revalidatePath("/", "layout");
  redirect(target);
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const returnPath = (f: FormData, fallback: string) => {
  const v = str(f, "returnTo");
  return v.startsWith("/") && !v.startsWith("//") ? v : fallback;
};

export async function loginAction(form: FormData) {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  const given = str(form, "password");
  const digest = (v: string) => createHash("sha256").update(v).digest();
  const next = str(form, "next");
  if (!expected || !timingSafeEqual(digest(given), digest(expected))) redirect("/login?error=1");
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(sessionSecret()), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7,
  });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

const ints = (f: FormData, k: string) => f.getAll(k).map(Number).filter((n) => Number.isInteger(n));
const strs = (f: FormData, k: string) => f.getAll(k).map(String).filter(Boolean);
const bool = (f: FormData, k: string) => f.get(k) === "on";

export async function saveDiscoverySettings(form: FormData) {
  await run("/discovery", async () => {
    const parsed = z.object({
      discovery_interval_minutes: z.coerce.number().int().min(5).max(10080),
      discovery_max_per_run: z.coerce.number().int().min(1).max(5000),
    }).parse({ discovery_interval_minutes: form.get("interval"), discovery_max_per_run: form.get("max") });
    await updateSettings(getDb(), {
      ...parsed,
      criteria_birth_years: ints(form, "years"),
      criteria_genders: strs(form, "genders"),
      criteria_countries: strs(form, "countries"),
      criteria_positions: strs(form, "positions"),
      discovery_enabled: bool(form, "enabled"),
    });
    return "Discovery settings saved.";
  });
}

export async function runDiscoveryNow() {
  await run("/discovery", async () => {
    const db = getDb();
    await enqueueJob(db, "discovery.run", { maxAttempts: 2 });
    const r = await runDueJobs(db, defaultDeps(), { limit: 5 });
    return `Discovery job ran (${r.succeeded} succeeded, ${r.retried + r.dead} failed). See the runs table below.`;
  });
}

export async function importCsvAction(form: FormData) {
  await run("/discovery", async () => {
    const file = form.get("file");
    const text = file instanceof File && file.size ? await file.text() : str(form, "csv");
    if (!text) throw new Error("Choose a CSV file or paste CSV text.");
    const db = getDb();
    const { athletes, errors } = parseAthleteCsv(text);
    const s = await getSettings(db);
    const criteria = bool(form, "applyCriteria")
      ? { birthYears: s.criteria_birth_years, genders: s.criteria_genders, countries: s.criteria_countries, positions: s.criteria_positions }
      : undefined;
    const stats = await ingestAthletes(db, athletes, { source: "csv", criteria });
    return `CSV: ${stats.inserted} imported, ${stats.duplicates} duplicates, ${stats.skippedCriteria} outside criteria, ${stats.skippedSuppressed} suppressed, ${stats.invalid + errors.length} invalid.`;
  });
}

export async function saveOutreachSettings(form: FormData) {
  await run("/settings", async () => {
    const timezone = str(form, "timezone");
    if (!isValidTimeZone(timezone)) throw new Error(`Unknown timezone "${timezone}".`);
    const n = (k: string) => z.coerce.number().int().parse(form.get(k));
    const patch: Partial<Settings> = {
      outreach_enabled: bool(form, "outreach_enabled"),
      auto_approve_adults: bool(form, "auto_approve_adults"),
      daily_cap: n("daily_cap"),
      min_interval_seconds: n("min_interval_seconds"),
      window_start_hour: n("window_start_hour"),
      window_end_hour: n("window_end_hour"),
      send_days: ints(form, "send_days"),
      timezone,
      sender_name: str(form, "sender_name"),
      sender_org: str(form, "sender_org") || "Venture Sports USA",
      plan_backlog_cap: n("plan_backlog_cap"),
      followups_enabled: bool(form, "followups_enabled"),
      followup_delay_days: n("followup_delay_days"),
      max_followups: n("max_followups"),
      no_response_after_days: n("no_response_after_days"),
      min_contact_age: n("min_contact_age"),
    };
    if (patch.window_end_hour! <= patch.window_start_hour!) throw new Error("Window end must be after window start.");
    await updateSettings(getDb(), patch);
    return "Settings saved.";
  });
}

export async function resumeSendingAction(form: FormData) {
  await run(returnPath(form, "/settings"), async () => {
    await resumeSending(getDb());
    return "Sending resumed.";
  });
}

export async function planNowAction(form: FormData) {
  await run(returnPath(form, "/outreach"), async () => {
    const db = getDb();
    const intros = await planIntros(db);
    const followups = await planFollowups(db);
    if ("skipped" in intros && intros.skipped === "sender_name_missing") throw new Error("Set a sender name in Settings first.");
    return `Drafted ${intros.planned} intro(s) and ${followups.planned} follow-up(s); ${intros.excluded} excluded by safeguards.`;
  });
}

export async function runJobsNowAction(form: FormData) {
  await run(returnPath(form, "/"), async () => {
    const r = await tick(getDb(), defaultDeps());
    return `Ran ${r.ran} job(s): ${r.succeeded} succeeded, ${r.retried} will retry, ${r.dead} failed.`;
  });
}

export async function approveAction(form: FormData) {
  await run(returnPath(form, "/outreach"), async () => {
    const n = await approveMessages(getDb(), strs(form, "ids"));
    return `${n} message(s) approved.`;
  });
}

export async function cancelMessageAction(form: FormData) {
  await run(returnPath(form, "/outreach"), async () => {
    await cancelMessage(getDb(), str(form, "id"));
    return "Message cancelled.";
  });
}

export async function saveDraftAction(form: FormData) {
  await run(returnPath(form, "/outreach"), async () => {
    await updateDraftBody(getDb(), str(form, "id"), str(form, "body"));
    return "Draft saved.";
  });
}

export async function logReplyAction(form: FormData) {
  const athleteId = str(form, "athleteId");
  await run(`/athletes/${athleteId}`, async () => {
    const db = getDb();
    const [conv] = await db.query<{ adapter: string; thread_id: string | null }>(
      "select adapter, thread_id from conversations where athlete_id = $1", [athleteId]);
    if (!conv) throw new Error("This athlete has not been contacted yet.");
    const body = str(form, "body");
    if (!body) throw new Error("Paste the reply text.");
    const r = await ingestInbound(db, conv.adapter, {
      externalId: `manual-${randomUUID()}`,
      threadId: conv.thread_id,
      athleteProfileUrl: (await db.query<{ profile_url: string }>("select profile_url from athletes where id = $1", [athleteId]))[0].profile_url,
      body,
      receivedAt: new Date(),
    });
    return r.status === "stored" ? `Reply logged and classified as ${r.category.replace("_", " ")}.` : "Reply could not be stored.";
  });
}

export async function reclassifyAction(form: FormData) {
  await run(returnPath(form, "/inbox"), async () => {
    const category = str(form, "category") as ReplyCategory;
    if (!["interested", "not_interested", "question"].includes(category)) throw new Error("Invalid category");
    await reclassifyMessage(getDb(), str(form, "id"), category);
    return "Reply reclassified.";
  });
}

export async function suppressAthleteAction(form: FormData) {
  const id = str(form, "athleteId");
  await run(returnPath(form, `/athletes/${id}`), async () => {
    await suppressAthlete(getDb(), id, "manual", { source: "manual", note: str(form, "note") || undefined });
    return "Athlete suppressed; all pending messages cancelled.";
  });
}

export async function liftSuppressionAction(form: FormData) {
  const id = str(form, "athleteId");
  await run(returnPath(form, "/suppressions"), async () => {
    await liftSuppression(getDb(), id);
    return "Suppression lifted (explicit opt-outs cannot be lifted).";
  });
}

export async function restoreAthleteAction(form: FormData) {
  const id = str(form, "athleteId");
  await run(`/athletes/${id}`, async () => {
    await restoreAthlete(getDb(), id);
    return "Athlete restored to the discovery pool.";
  });
}

export async function addSuppressionAction(form: FormData) {
  await run("/suppressions", async () => {
    const url = normalizeProfileUrl(str(form, "url"));
    if (!url) throw new Error("Enter a valid Volleybox profile URL.");
    await suppressProfileUrl(getDb(), url, "manual", str(form, "note") || undefined);
    return "Profile added to the suppression list.";
  });
}

export async function moveChannelAction(form: FormData) {
  const id = str(form, "athleteId");
  await run(returnPath(form, `/athletes/${id}`), async () => {
    const channel = str(form, "channel");
    if (channel !== "whatsapp" && channel !== "instagram") throw new Error("Invalid channel");
    await markMovedOffPlatform(getDb(), id, channel);
    return `Marked as moved to ${channel}. Automated messages stopped.`;
  });
}

export async function guardianConsentAction(form: FormData) {
  const id = str(form, "athleteId");
  await run(returnPath(form, `/athletes/${id}`), async () => {
    const note = str(form, "note");
    if (!note) throw new Error("Describe how the parent/guardian was involved (who, when, where).");
    await recordGuardianConsent(getDb(), id, note);
    return "Guardian involvement recorded.";
  });
}

export async function updateLeadAction(form: FormData) {
  const id = str(form, "athleteId");
  await run(returnPath(form, `/athletes/${id}`), async () => {
    const status = str(form, "status") as LeadStatus;
    await updateLead(getDb(), id, { status: status || undefined, notes: form.has("notes") ? str(form, "notes") : undefined });
    return "Lead updated.";
  });
}

export async function markAlertsReadAction(form: FormData) {
  await run(returnPath(form, "/"), async () => {
    const id = str(form, "id");
    if (id) await getDb().query("update alerts set read_at = now() where id = $1", [id]);
    else await getDb().query("update alerts set read_at = now() where read_at is null");
  });
}
