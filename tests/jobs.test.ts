import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { updateSettings } from "@/lib/settings";
import { MockDiscoveryAdapter } from "@/modules/discovery/adapters/mock";
import { MockMessagingAdapter } from "@/modules/messaging/adapters/mock";
import { HANDLERS } from "@/modules/jobs/handlers";
import { claimJobs, enqueueJob } from "@/modules/jobs/queue";
import { runDueJobs, scheduleRecurring, tick } from "@/modules/jobs/runner";
import { createTestDb } from "./helpers/db";

const NOW = new Date("2026-10-09T15:00:00Z");
let db: Db;
let deps: { discovery: MockDiscoveryAdapter; messaging: MockMessagingAdapter };
const one = async <T = any>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p))[0];

beforeEach(async () => {
  db = await createTestDb();
  deps = { discovery: new MockDiscoveryAdapter(2), messaging: new MockMessagingAdapter() };
});

describe("job queue", () => {
  it("dedupes by key", async () => {
    expect(await enqueueJob(db, "x", { dedupeKey: "k" })).toBeTruthy();
    expect(await enqueueJob(db, "x", { dedupeKey: "k" })).toBeNull();
  });

  it("does not hand the same job to two workers", async () => {
    await enqueueJob(db, "x", { runAt: NOW });
    const a = await claimJobs(db, "w1", NOW, 5);
    const b = await claimJobs(db, "w2", NOW, 5);
    expect([a.length, b.length]).toEqual([1, 0]);
  });

  it("retries failures with backoff then marks the job dead and alerts", async () => {
    HANDLERS["test.fail"] = async () => { throw new Error("nope"); };
    await enqueueJob(db, "test.fail", { maxAttempts: 2, runAt: NOW });
    expect(await runDueJobs(db, deps, { now: NOW })).toMatchObject({ retried: 1 });
    const job = await one("select status, attempts, last_error, run_at from jobs");
    expect(job).toMatchObject({ status: "queued", attempts: 1, last_error: "nope" });
    expect(new Date(job.run_at).getTime()).toBeGreaterThan(Date.now());
    await db.query("update jobs set run_at = $1", [NOW]);
    expect(await runDueJobs(db, deps, { now: NOW })).toMatchObject({ dead: 1 });
    expect(await one("select status from jobs")).toMatchObject({ status: "dead" });
    expect((await one("select count(*)::int n from alerts where kind='job_dead'")).n).toBe(1);
    delete HANDLERS["test.fail"];
  });

  it("fails jobs with unknown types", async () => {
    await enqueueJob(db, "unknown", { runAt: NOW, maxAttempts: 1 });
    expect(await runDueJobs(db, deps, { now: NOW })).toMatchObject({ dead: 1 });
  });
});

describe("scheduler", () => {
  it("enqueues recurring jobs once per bucket and only runs discovery when enabled", async () => {
    expect(await scheduleRecurring(db, NOW)).not.toContain("discovery.run");
    expect(await scheduleRecurring(db, NOW)).toEqual([]);
    await updateSettings(db, { discovery_enabled: true });
    expect(await scheduleRecurring(db, NOW)).toContain("discovery.run");
  });

  it("runs the full pipeline: discover -> plan -> send -> reply", async () => {
    await updateSettings(db, {
      discovery_enabled: true, outreach_enabled: true, auto_approve_adults: true, sender_name: "Sam",
      criteria_birth_years: [2007], criteria_countries: ["IT"], criteria_genders: ["female"], min_interval_seconds: 0,
    });
    await tick(db, deps, NOW); // discovery + plan run in the same tick (plan may run before discovery finishes)
    await tick(db, deps, new Date(NOW.getTime() + 6 * 60_000));
    expect((await one("select count(*)::int n from athletes")).n).toBe(2);
    expect((await one("select count(*)::int n from messages where status='sent'")).n).toBe(2);
    const a = await one("select athlete_id from conversations limit 1");
    deps.messaging.inbox.push({ externalId: "r1", threadId: `mock-thread-${a.athlete_id}`, body: "Sì, mi interessa", receivedAt: NOW });
    await tick(db, deps, new Date(NOW.getTime() + 12 * 60_000));
    expect((await one("select count(*)::int n from leads")).n).toBe(1);
    expect((await one("select count(*)::int n from alerts where kind='interested'")).n).toBe(1);
  });
});
