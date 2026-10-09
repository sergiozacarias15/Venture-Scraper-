import type { Db } from "@/lib/db";
import { errMessage } from "@/lib/logger";
import { getSettings } from "@/lib/settings";
import { HANDLERS, type Deps } from "./handlers";
import { claimJobs, completeJob, enqueueJob, failJob, recoverStaleJobs } from "./queue";

type Recurring = { type: string; everyMinutes: (s: Awaited<ReturnType<typeof getSettings>>) => number | null };

export const RECURRING: Recurring[] = [
  { type: "discovery.run", everyMinutes: (s) => (s.discovery_enabled ? s.discovery_interval_minutes : null) },
  { type: "outreach.plan", everyMinutes: () => 5 },
  { type: "outreach.send", everyMinutes: () => 1 },
  { type: "responses.poll", everyMinutes: () => 2 },
  { type: "responses.sweep", everyMinutes: () => 60 },
];

/** Enqueues each recurring job once per time bucket (dedupe key), so overlapping ticks are harmless. */
export async function scheduleRecurring(db: Db, now = new Date()) {
  const s = await getSettings(db);
  const queued: string[] = [];
  for (const r of RECURRING) {
    const every = r.everyMinutes(s);
    if (!every) continue;
    const bucket = Math.floor(now.getTime() / (every * 60_000));
    const id = await enqueueJob(db, r.type, { dedupeKey: `${r.type}:${bucket}`, runAt: now });
    if (id) queued.push(r.type);
  }
  return queued;
}

export async function runDueJobs(db: Db, deps: Deps, opts: { now?: Date; limit?: number; workerId?: string } = {}) {
  const now = opts.now ?? new Date();
  await recoverStaleJobs(db, now);
  const jobs = await claimJobs(db, opts.workerId ?? `worker-${process.pid}`, now, opts.limit ?? 10);
  const summary = { ran: 0, succeeded: 0, retried: 0, dead: 0 };
  for (const job of jobs) {
    summary.ran++;
    const handler = HANDLERS[job.type];
    try {
      if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);
      const result = await handler({ db, deps, now, payload: job.payload });
      await completeJob(db, job.id, result, new Date());
      summary.succeeded++;
    } catch (err) {
      const outcome = await failJob(db, job, err instanceof Error ? err : new Error(errMessage(err)), new Date());
      if (outcome === "dead") summary.dead++;
      else summary.retried++;
    }
  }
  return summary;
}

export async function tick(db: Db, deps: Deps, now = new Date()) {
  const scheduled = await scheduleRecurring(db, now);
  const run = await runDueJobs(db, deps, { now });
  return { scheduled, ...run };
}
