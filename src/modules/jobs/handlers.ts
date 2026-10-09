import type { Db } from "@/lib/db";
import { addDays } from "@/lib/time";
import { getDiscoveryAdapter } from "@/modules/discovery/adapters";
import { runDiscovery } from "@/modules/discovery/service";
import type { DiscoveryAdapter } from "@/modules/discovery/types";
import { getMessagingAdapter } from "@/modules/messaging/adapters";
import type { MessagingAdapter } from "@/modules/messaging/adapters/types";
import { planFollowups, planIntros, sendDueMessages } from "@/modules/messaging/service";
import { markNoResponse, pollReplies } from "@/modules/responses/service";

export type Deps = { discovery: DiscoveryAdapter | null; messaging: MessagingAdapter };
export type JobContext = { db: Db; deps: Deps; now: Date; payload: Record<string, unknown> };
export type JobHandler = (ctx: JobContext) => Promise<unknown>;

export function defaultDeps(): Deps {
  return { discovery: getDiscoveryAdapter(), messaging: getMessagingAdapter() };
}

export const HANDLERS: Record<string, JobHandler> = {
  "discovery.run": async ({ db, deps }) =>
    deps.discovery ? runDiscovery(db, deps.discovery) : { skipped: "no automated discovery source (assisted mode)" },
  "outreach.plan": async ({ db, now }) => ({
    intros: await planIntros(db, now),
    followups: await planFollowups(db, now),
  }),
  "outreach.send": async ({ db, deps, now }) =>
    deps.messaging.manual ? { skipped: "assisted mode: the operator sends and confirms messages" } : sendDueMessages(db, deps.messaging, now),
  "responses.poll": ({ db, deps }) => pollReplies(db, deps.messaging),
  "responses.sweep": async ({ db, now }) => {
    const noResponse = await markNoResponse(db, now);
    const pruned = await db.query("delete from jobs where status = 'succeeded' and finished_at < $1 returning id", [addDays(now, -14)]);
    const logs = await db.query("delete from event_log where created_at < $1 returning id", [addDays(now, -60)]);
    return { noResponse, prunedJobs: pruned.length, prunedLogs: logs.length };
  },
};
