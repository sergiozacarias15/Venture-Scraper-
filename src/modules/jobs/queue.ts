import { createAlert } from "@/lib/alerts";
import type { Db } from "@/lib/db";
import { errMessage, logEvent } from "@/lib/logger";
import { addMinutes } from "@/lib/time";

export type JobRow = {
  id: string; type: string; payload: Record<string, unknown>; attempts: number; max_attempts: number;
};

export async function enqueueJob(
  db: Db, type: string,
  opts: { payload?: Record<string, unknown>; runAt?: Date; dedupeKey?: string; maxAttempts?: number } = {},
): Promise<string | null> {
  const rows = await db.query<{ id: string }>(
    `insert into jobs (type, payload, run_at, dedupe_key, max_attempts) values ($1,$2::jsonb,$3,$4,$5)
     on conflict (dedupe_key) do nothing returning id`,
    [type, JSON.stringify(opts.payload ?? {}), opts.runAt ?? new Date(), opts.dedupeKey ?? null, opts.maxAttempts ?? 5],
  );
  return rows[0]?.id ?? null;
}

/** Claims due jobs with row locks so concurrent workers (cron + worker script) never run the same job twice. */
export async function claimJobs(db: Db, workerId: string, now: Date, limit: number): Promise<JobRow[]> {
  return db.query<JobRow>(
    `update jobs set status = 'running', locked_at = $2, locked_by = $1, attempts = attempts + 1
     where id in (select id from jobs where status = 'queued' and run_at <= $2 order by run_at for update skip locked limit $3)
     returning id, type, payload, attempts, max_attempts`,
    [workerId, now, limit],
  );
}

export async function completeJob(db: Db, id: string, result: unknown, now = new Date()) {
  await db.query("update jobs set status='succeeded', result=$2::jsonb, last_error=null, finished_at=$3, locked_at=null where id=$1",
    [id, JSON.stringify(result ?? null), now]);
}

export function jobBackoffSeconds(attempt: number) {
  return Math.min(30 * 2 ** (attempt - 1), 3600);
}

export async function failJob(db: Db, job: JobRow, err: unknown, now = new Date()) {
  const message = errMessage(err);
  if (job.attempts >= job.max_attempts) {
    await db.query("update jobs set status='dead', last_error=$2, finished_at=$3, locked_at=null where id=$1", [job.id, message, now]);
    await createAlert(db, { kind: "job_dead", title: `Background job "${job.type}" failed permanently`, body: message });
    await logEvent(db, "error", "jobs", `Job ${job.type} is dead after ${job.attempts} attempts: ${message}`, { meta: { jobId: job.id } });
    return "dead" as const;
  }
  const runAt = new Date(now.getTime() + jobBackoffSeconds(job.attempts) * 1000);
  await db.query("update jobs set status='queued', run_at=$2, last_error=$3, locked_at=null where id=$1", [job.id, runAt, message]);
  await logEvent(db, "warn", "jobs", `Job ${job.type} failed (attempt ${job.attempts}/${job.max_attempts}), retrying: ${message}`, { meta: { jobId: job.id } });
  return "retry" as const;
}

/** Jobs left "running" by a crashed worker are put back on the queue. */
export async function recoverStaleJobs(db: Db, now = new Date()) {
  const rows = await db.query("update jobs set status='queued', locked_at=null where status='running' and locked_at < $1 returning id", [addMinutes(now, -15)]);
  return rows.length;
}
