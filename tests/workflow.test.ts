import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { updateSettings } from "@/lib/settings";
import { MockDiscoveryAdapter } from "@/modules/discovery/adapters/mock";
import { ingestAthletes, runDiscovery } from "@/modules/discovery/service";
import { MockMessagingAdapter } from "@/modules/messaging/adapters/mock";
import { PermanentSendError, SendBlockedError, TransientSendError } from "@/modules/messaging/adapters/types";
import { approveMessages, cancelMessage, planFollowups, planIntros, resumeSending, sendDueMessages } from "@/modules/messaging/service";
import { suppressAthlete } from "@/modules/messaging/suppression";
import { ingestInbound, markNoResponse, pollReplies, reclassifyMessage } from "@/modules/responses/service";
import { GuardianConsentRequired, markMovedOffPlatform, recordGuardianConsent } from "@/modules/leads/service";
import { createTestDb, seedAthlete } from "./helpers/db";

// Friday 11:00 America/New_York
const NOW = new Date("2026-10-09T15:00:00Z");
const minutes = (m: number) => new Date(NOW.getTime() + m * 60_000);
const days = (d: number) => new Date(NOW.getTime() + d * 86_400_000);

let db: Db;
let mock: MockMessagingAdapter;

async function one<T = any>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params))[0];
}

beforeEach(async () => {
  db = await createTestDb();
  mock = new MockMessagingAdapter();
  await updateSettings(db, {
    sender_name: "Sam Carter", outreach_enabled: true, auto_approve_adults: true,
    criteria_birth_years: [2007, 2008, 2009, 2010], criteria_countries: ["IT", "ES", "PT", "BR"], criteria_genders: ["female", "male"],
    min_interval_seconds: 0, daily_cap: 10,
  });
});

describe("discovery", () => {
  it("imports matching athletes, dedupes on re-run, and keeps outreach status", async () => {
    const adapter = new MockDiscoveryAdapter(3);
    const first = await runDiscovery(db, adapter, { birthYears: [2007, 2008], genders: ["female"], countries: ["IT", "BR"], positions: [] });
    expect(first).toMatchObject({ found: 12, inserted: 12, duplicates: 0 });
    const a = await one<{ id: string }>("select id from athletes limit 1");
    await db.query("update athletes set status='contacted' where id=$1", [a.id]);
    const second = await runDiscovery(db, adapter, { birthYears: [2007, 2008], genders: ["female"], countries: ["IT", "BR"], positions: [] });
    expect(second).toMatchObject({ inserted: 0, duplicates: 12 });
    expect((await one("select status from athletes where id=$1", [a.id])).status).toBe("contacted");
    expect((await one("select count(*)::int n from athletes")).n).toBe(12);
  });

  it("filters out athletes outside the criteria and never re-adds suppressed profiles", async () => {
    await db.query("insert into suppressions (profile_url, reason) values ('https://volleybox.net/p/blocked','manual')");
    const stats = await ingestAthletes(db, [
      { profileUrl: "https://volleybox.net/p/ok", fullName: "Ok One", birthYear: 2008, gender: "female", nationality: "IT" },
      { profileUrl: "https://volleybox.net/p/old", fullName: "Too Old", birthYear: 1999, gender: "female", nationality: "IT" },
      { profileUrl: "https://volleybox.net/p/blocked", fullName: "Blocked One", birthYear: 2008, gender: "female", nationality: "IT" },
      { profileUrl: "https://elsewhere.com/x", fullName: "Bad Url", birthYear: 2008, gender: "female", nationality: "IT" },
    ], { source: "csv", criteria: { birthYears: [2007, 2008], genders: ["female"], countries: ["IT"], positions: [] } });
    expect(stats).toMatchObject({ inserted: 1, skippedCriteria: 1, skippedSuppressed: 1, invalid: 1 });
  });

  it("records failed runs", async () => {
    const failing = { id: "x", live: true, search: async () => { throw new Error("boom"); } };
    await expect(runDiscovery(db, failing, { birthYears: [2007], genders: [], countries: ["IT"], positions: [] })).rejects.toThrow("boom");
    expect(await one("select status, error from discovery_runs")).toMatchObject({ status: "failed", error: "boom" });
  });
});

describe("outreach planning", () => {
  it("drafts language-appropriate messages and requires approval for potential minors", async () => {
    const adult = await seedAthlete(db, { birthYear: 2007, nationality: "IT", name: "Giulia Rossi", club: "Modena VC" });
    const minor = await seedAthlete(db, { birthYear: 2009, nationality: "BR", name: "Ana Lima" });
    const explicit = await seedAthlete(db, { birthYear: 2007, nationality: "IT", language: "es", name: "Lucia Garcia" });
    expect(await planIntros(db, NOW)).toMatchObject({ planned: 3 });
    const m = async (id: string) => one("select * from messages where athlete_id=$1", [id]);
    expect(await m(adult)).toMatchObject({ language: "it", status: "approved", requires_approval: false });
    expect((await m(adult)).body).toMatch(/Ciao Giulia.*Modena VC/);
    expect(await m(minor)).toMatchObject({ language: "pt", status: "pending_approval", requires_approval: true });
    expect((await m(minor)).body).toMatch(/responsável/);
    expect((await m(explicit)).language).toBe("es");
    expect((await one("select status from athletes where id=$1", [adult])).status).toBe("queued");
  });

  it("excludes athletes that are too young or have unverified age", async () => {
    const young = await seedAthlete(db, { birthYear: 2010 });
    await db.query("update settings set min_contact_age = 17");
    const unknown = await seedAthlete(db, { birthYear: null });
    await planIntros(db, NOW);
    expect((await one("select status, excluded_reason from athletes where id=$1", [young]))).toMatchObject({ status: "excluded", excluded_reason: "too_young" });
    // unknown birth year does not match the discovery criteria, so it is never planned
    expect((await one("select status from athletes where id=$1", [unknown])).status).toBe("discovered");
  });

  it("does not plan without a sender name, respects the backlog cap, and skips suppressed athletes", async () => {
    await updateSettings(db, { sender_name: "" });
    await seedAthlete(db);
    expect(await planIntros(db, NOW)).toMatchObject({ planned: 0, skipped: "sender_name_missing" });
    await updateSettings(db, { sender_name: "Sam", plan_backlog_cap: 2 });
    for (let i = 0; i < 4; i++) await seedAthlete(db);
    const blocked = await seedAthlete(db);
    await db.query("insert into suppressions (profile_url, reason) select profile_url, 'manual' from athletes where id=$1", [blocked]);
    expect((await planIntros(db, NOW)).planned).toBe(2);
    expect((await planIntros(db, NOW))).toMatchObject({ planned: 0, skipped: "backlog_full" });
    expect((await one("select count(*)::int n from messages where athlete_id=$1", [blocked])).n).toBe(0);
  });

  it("database prevents a second live intro per athlete", async () => {
    const id = await seedAthlete(db);
    await planIntros(db, NOW);
    await expect(db.query("insert into messages (athlete_id, direction, kind, body, status) values ($1,'out','intro','dup','approved')", [id])).rejects.toThrow();
  });
});

describe("send queue", () => {
  it("sends approved messages through the adapter, tracks conversation state, and never double-sends", async () => {
    const id = await seedAthlete(db);
    await planIntros(db, NOW);
    const r = await sendDueMessages(db, mock, NOW);
    expect(r.sent).toBe(1);
    expect(mock.sent).toHaveLength(1);
    expect(await one("select status, first_contacted_at is not null as contacted from athletes where id=$1", [id])).toMatchObject({ status: "contacted", contacted: true });
    expect(await one("select status, adapter, external_id from messages where athlete_id=$1", [id])).toMatchObject({ status: "sent", adapter: "mock" });
    expect(await one("select thread_id, conversation_url from conversations where athlete_id=$1", [id])).toMatchObject({ thread_id: `mock-thread-${id}` });
    expect((await sendDueMessages(db, mock, minutes(5))).sent).toBe(0);
    expect(mock.sent).toHaveLength(1);
  });

  it("holds messages that need approval until approved", async () => {
    const id = await seedAthlete(db, { birthYear: 2009 });
    await planIntros(db, NOW);
    expect((await sendDueMessages(db, mock, NOW)).sent).toBe(0);
    const msg = await one<{ id: string }>("select id from messages where athlete_id=$1", [id]);
    expect(await approveMessages(db, [msg.id])).toBe(1);
    expect((await sendDueMessages(db, mock, NOW)).sent).toBe(1);
  });

  it("enforces the daily cap, minimum interval, window and master switch", async () => {
    for (let i = 0; i < 4; i++) await seedAthlete(db);
    await planIntros(db, NOW);
    await updateSettings(db, { daily_cap: 2 });
    expect((await sendDueMessages(db, mock, NOW)).sent).toBe(2);
    expect((await sendDueMessages(db, mock, minutes(30))).stoppedReason).toMatch(/Daily cap/);
    await updateSettings(db, { daily_cap: 10, min_interval_seconds: 600 });
    expect((await sendDueMessages(db, mock, minutes(5))).stoppedReason).toMatch(/interval/);
    expect((await sendDueMessages(db, mock, minutes(11))).sent).toBe(1);
    expect((await sendDueMessages(db, mock, new Date("2026-10-10T15:00:00Z"))).stoppedReason).toMatch(/sending day/);
    await updateSettings(db, { outreach_enabled: false });
    expect((await sendDueMessages(db, mock, days(3))).stoppedReason).toMatch(/switched off/);
  });

  it("re-checks suppression at send time", async () => {
    const id = await seedAthlete(db);
    await planIntros(db, NOW);
    await db.query("update athletes set status='suppressed' where id=$1", [id]);
    const r = await sendDueMessages(db, mock, NOW);
    expect(r).toMatchObject({ sent: 0, cancelled: 1 });
    expect(mock.sent).toHaveLength(0);
  });

  it("retries transient errors with backoff and fails after max attempts", async () => {
    const id = await seedAthlete(db);
    await planIntros(db, NOW);
    mock.failures.push(new TransientSendError("503"), new TransientSendError("503"), new TransientSendError("503"));
    expect((await sendDueMessages(db, mock, NOW)).stoppedReason).toBe("transient_error");
    let msg = await one("select status, attempts, send_after from messages where athlete_id=$1", [id]);
    expect(msg).toMatchObject({ status: "approved", attempts: 1 });
    expect(new Date(msg.send_after).getTime()).toBe(minutes(1).getTime());
    expect((await sendDueMessages(db, mock, NOW)).sent).toBe(0);
    await sendDueMessages(db, mock, minutes(2));
    await sendDueMessages(db, mock, minutes(30));
    msg = await one("select status, attempts, last_error from messages where athlete_id=$1", [id]);
    expect(msg).toMatchObject({ status: "failed", attempts: 3, last_error: "503" });
    expect((await one("select count(*)::int n from alerts where kind='send_failed'")).n).toBe(1);
  });

  it("pauses all sending when Volleybox raises a captcha or rate limit, and never retries around it", async () => {
    await seedAthlete(db);
    await seedAthlete(db);
    await planIntros(db, NOW);
    mock.failures.push(new SendBlockedError("captcha", "CAPTCHA required"));
    const r = await sendDueMessages(db, mock, NOW);
    expect(r).toMatchObject({ sent: 0, stoppedReason: "captcha" });
    expect(mock.sent).toHaveLength(0);
    expect((await one("select count(*)::int n from messages where status='approved'")).n).toBe(2);
    expect((await sendDueMessages(db, mock, days(3))).stoppedReason).toMatch(/paused/);
    expect((await one("select count(*)::int n from alerts where kind='sending_paused'")).n).toBe(1);
    await resumeSending(db);
    expect((await sendDueMessages(db, mock, days(3))).sent).toBe(2);
  });

  it("marks recipients that cannot be messaged as unreachable", async () => {
    const id = await seedAthlete(db);
    await planIntros(db, NOW);
    mock.failures.push(new PermanentSendError("Recipient has disabled messages"));
    expect((await sendDueMessages(db, mock, NOW)).failed).toBe(1);
    expect((await one("select status from athletes where id=$1", [id])).status).toBe("unreachable");
  });

  it("cancelling a draft removes it from the queue and excludes the athlete", async () => {
    const id = await seedAthlete(db, { birthYear: 2009 });
    await planIntros(db, NOW);
    const msg = await one<{ id: string }>("select id from messages where athlete_id=$1", [id]);
    await cancelMessage(db, msg.id);
    expect((await one("select status, excluded_reason from athletes where id=$1", [id]))).toMatchObject({ status: "excluded", excluded_reason: "rejected_in_review" });
  });
});

describe("replies, follow-ups and suppression", () => {
  async function contacted(over: Parameters<typeof seedAthlete>[1] = {}) {
    const id = await seedAthlete(db, over);
    await planIntros(db, NOW);
    await sendDueMessages(db, mock, NOW);
    return id;
  }
  const reply = (athleteId: string, body: string, externalId = `in-${Math.random()}`) =>
    ingestInbound(db, "mock", { externalId, threadId: `mock-thread-${athleteId}`, body, receivedAt: minutes(60) });

  it("flags interested replies, creates a lead and an alert, and stops follow-ups", async () => {
    const id = await contacted();
    const res = await reply(id, "Yes, I'm interested, tell me more!");
    expect(res).toMatchObject({ status: "stored", category: "interested" });
    expect((await one("select status from athletes where id=$1", [id])).status).toBe("interested");
    expect(await one("select status from leads where athlete_id=$1", [id])).toMatchObject({ status: "new" });
    expect(await one("select kind, athlete_id from alerts where kind='interested'")).toMatchObject({ athlete_id: id });
    expect(await one("select outcome from conversations where athlete_id=$1", [id])).toMatchObject({ outcome: "interested" });
    expect((await planFollowups(db, days(10))).planned).toBe(0);
  });

  it("deduplicates inbound messages by external id", async () => {
    const id = await contacted();
    await reply(id, "Quanto costa?", "same-id");
    expect(await reply(id, "Quanto costa?", "same-id")).toMatchObject({ status: "duplicate" });
    expect((await one("select count(*)::int n from messages where direction='in'")).n).toBe(1);
  });

  it("suppresses decliners, cancels pending follow-ups, and blocks re-import and re-queue", async () => {
    const id = await contacted();
    await planFollowups(db, days(5));
    expect((await one("select count(*)::int n from messages where kind='followup' and status='approved'")).n).toBe(1);
    await reply(id, "No thanks, not interested");
    expect((await one("select status from athletes where id=$1", [id])).status).toBe("suppressed");
    expect(await one("select reason from suppressions where athlete_id=$1", [id])).toMatchObject({ reason: "declined" });
    expect((await one("select count(*)::int n from messages where kind='followup' and status='approved'")).n).toBe(0);
    expect((await sendDueMessages(db, mock, days(6))).sent).toBe(0);
    const url = (await one("select profile_url from athletes where id=$1", [id])).profile_url;
    const stats = await ingestAthletes(db, [{ profileUrl: url, fullName: "Giulia Rossi", birthYear: 2007, gender: "female", nationality: "IT" }], { source: "csv" });
    expect(stats.skippedSuppressed).toBe(1);
  });

  it("records explicit opt-outs", async () => {
    const id = await contacted();
    await reply(id, "Please stop messaging me");
    expect(await one("select reason from suppressions where athlete_id=$1", [id])).toMatchObject({ reason: "opt_out" });
  });

  it("sends one follow-up after the delay, then marks No Response", async () => {
    const id = await contacted();
    expect((await planFollowups(db, days(2))).planned).toBe(0);
    expect((await planFollowups(db, days(5))).planned).toBe(1);
    expect((await planFollowups(db, days(5))).planned).toBe(0);
    const r = await sendDueMessages(db, mock, new Date(days(5).getTime() + 0));
    expect(r.sent).toBe(1);
    expect(mock.sent[1].body).toMatch(/Ciao.*seguito/s);
    expect((await one("select followups_sent from conversations where athlete_id=$1", [id])).followups_sent).toBe(1);
    expect((await planFollowups(db, days(20))).planned).toBe(0);
    expect(await markNoResponse(db, days(8))).toBe(0);
    expect(await markNoResponse(db, days(13))).toBe(1);
    expect(await one("select outcome, status from conversations where athlete_id=$1", [id])).toMatchObject({ outcome: "no_response", status: "closed" });
  });

  it("lets the operator correct a wrong classification", async () => {
    const id = await contacted();
    const res = await reply(id, "Not now, thanks") as { messageId: string };
    expect((await one("select status from athletes where id=$1", [id])).status).toBe("suppressed");
    await reclassifyMessage(db, res.messageId, "interested");
    expect((await one("select status from athletes where id=$1", [id])).status).toBe("interested");
    expect((await one("select count(*)::int n from suppressions where athlete_id=$1", [id])).n).toBe(0);
    expect((await one("select category_source from messages where id=$1", [res.messageId])).category_source).toBe("manual");
  });

  it("does not lift an explicit opt-out through reclassification", async () => {
    const id = await contacted();
    const res = await reply(id, "Stop writing to me") as { messageId: string };
    await reclassifyMessage(db, res.messageId, "interested");
    expect((await one("select status from athletes where id=$1", [id])).status).toBe("suppressed");
  });

  it("polls replies from the adapter and advances", async () => {
    const id = await contacted();
    mock.inbox.push({ externalId: "p1", threadId: `mock-thread-${id}`, body: "Sim, tenho interesse", receivedAt: minutes(10) });
    expect(await pollReplies(db, mock)).toMatchObject({ stored: 1 });
  });

  it("reports unmatched inbound messages", async () => {
    expect(await ingestInbound(db, "mock", { externalId: "z", threadId: "nope", body: "hi", receivedAt: NOW })).toEqual({ status: "unmatched" });
  });

  it("manual suppression stops everything", async () => {
    const id = await seedAthlete(db);
    await planIntros(db, NOW);
    await suppressAthlete(db, id, "manual");
    expect((await sendDueMessages(db, mock, NOW)).sent).toBe(0);
    expect((await one("select status from messages where athlete_id=$1", [id])).status).toBe("cancelled");
  });
});

describe("lead management", () => {
  it("requires guardian involvement before moving a potential minor off-platform", async () => {
    const id = await seedAthlete(db, { birthYear: 2009 });
    await db.query("insert into leads (athlete_id) values ($1)", [id]);
    await expect(markMovedOffPlatform(db, id, "whatsapp", NOW)).rejects.toBeInstanceOf(GuardianConsentRequired);
    await recordGuardianConsent(db, id, "Mother confirmed by email");
    await markMovedOffPlatform(db, id, "whatsapp", NOW);
    expect(await one("select status, off_platform_channel from leads where athlete_id=$1", [id])).toMatchObject({ status: "moved_whatsapp", off_platform_channel: "whatsapp" });
  });
  it("lets adults move to Instagram directly", async () => {
    const id = await seedAthlete(db, { birthYear: 2007 });
    await markMovedOffPlatform(db, id, "instagram", NOW);
    expect((await one("select status from leads where athlete_id=$1", [id])).status).toBe("moved_instagram");
  });
});

describe("assisted mode (operator sends on Volleybox)", () => {
  async function ready(over: Parameters<typeof seedAthlete>[1] = {}) {
    const id = await seedAthlete(db, over);
    await planIntros(db, NOW);
    const m = await one<{ id: string }>("select id from messages where athlete_id=$1", [id]);
    return { id, messageId: m.id };
  }

  it("does not send automatically; lists approved messages for the operator", async () => {
    const { messageId } = await ready();
    const { AssistedMessagingAdapter } = await import("@/modules/messaging/adapters/assisted");
    const { HANDLERS } = await import("@/modules/jobs/handlers");
    const res = await HANDLERS["outreach.send"]({ db, deps: { discovery: null, messaging: new AssistedMessagingAdapter() }, now: NOW, payload: {} });
    expect(res).toMatchObject({ skipped: expect.stringContaining("assisted") });
    const { listReadyToSend } = await import("@/modules/messaging/service");
    expect((await listReadyToSend(db)).map((r) => r.id)).toEqual([messageId]);
  });

  it("confirming a send records the conversation so replies and follow-ups work", async () => {
    const { id, messageId } = await ready();
    const { confirmManualSend } = await import("@/modules/messaging/service");
    await confirmManualSend(db, messageId, NOW);
    expect(await one("select status, adapter from messages where id=$1", [messageId])).toMatchObject({ status: "sent", adapter: "assisted" });
    expect((await one("select status from athletes where id=$1", [id])).status).toBe("contacted");
    expect((await planFollowups(db, days(5))).planned).toBe(1);
    const r = await ingestInbound(db, "assisted", { externalId: "m1", threadId: `manual-${id}`, body: "Sì, mi interessa", receivedAt: minutes(30) });
    expect(r).toMatchObject({ status: "stored", category: "interested" });
  });

  it("cannot confirm twice and enforces suppression, cap, gap and pause", async () => {
    const { confirmManualSend, reportPlatformLimit } = await import("@/modules/messaging/service");
    const a = await ready();
    const b = await ready();
    const c = await ready();
    await updateSettings(db, { daily_cap: 2, min_interval_seconds: 60 });
    await confirmManualSend(db, a.messageId, NOW);
    await expect(confirmManualSend(db, a.messageId, minutes(5))).rejects.toThrow(/no longer waiting/);
    await expect(confirmManualSend(db, b.messageId, new Date(NOW.getTime() + 10_000))).rejects.toThrow(/Minimum interval/);
    await confirmManualSend(db, b.messageId, minutes(2));
    await expect(confirmManualSend(db, c.messageId, minutes(10))).rejects.toThrow(/Daily cap/);
    await updateSettings(db, { daily_cap: 10 });
    await reportPlatformLimit(db, "CAPTCHA shown", minutes(11));
    await expect(confirmManualSend(db, c.messageId, minutes(12))).rejects.toThrow(/paused/);
    expect((await one("select count(*)::int n from alerts where kind='sending_paused'")).n).toBe(1);
  });

  it("refuses to confirm for suppressed athletes or unapproved minors", async () => {
    const { confirmManualSend } = await import("@/modules/messaging/service");
    const blocked = await ready();
    await db.query("insert into suppressions (profile_url, reason) select profile_url, 'manual' from athletes where id=$1", [blocked.id]);
    await expect(confirmManualSend(db, blocked.messageId, NOW)).rejects.toThrow(/suppression/);
    expect((await one("select status from messages where id=$1", [blocked.messageId])).status).toBe("cancelled");
    const minor = await ready({ birthYear: 2009 });
    await expect(confirmManualSend(db, minor.messageId, NOW)).rejects.toThrow(/no longer waiting/);
  });

  it("marks athletes that Volleybox will not let you message as unreachable", async () => {
    const { reportCannotMessage } = await import("@/modules/messaging/service");
    const { id, messageId } = await ready();
    await reportCannotMessage(db, messageId, "Athlete does not accept messages from scouts");
    expect((await one("select status from athletes where id=$1", [id])).status).toBe("unreachable");
    expect((await one("select status, last_error from messages where id=$1", [messageId]))).toMatchObject({ status: "failed" });
  });
});
