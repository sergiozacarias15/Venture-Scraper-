import { createAlert } from "@/lib/alerts";
import type { Db } from "@/lib/db";
import { errMessage, logEvent } from "@/lib/logger";
import { getSettings, updateSettings } from "@/lib/settings";
import { addDays } from "@/lib/time";
import { ensureLead } from "@/modules/leads/service";
import type { InboundMessage, MessagingAdapter } from "@/modules/messaging/adapters/types";
import { stopAutomation, suppressAthlete } from "@/modules/messaging/suppression";
import { classifyReply, type ReplyCategory } from "./classifier";

export type IngestResult =
  | { status: "stored"; messageId: string; category: ReplyCategory }
  | { status: "duplicate" }
  | { status: "unmatched" };

type AthleteLite = { id: string; full_name: string; first_name: string; status: string };

async function applyCategory(
  db: Db, athlete: AthleteLite, messageId: string, category: ReplyCategory,
  opts: { optOut: boolean; source: "auto" | "manual"; excerpt: string },
) {
  if (category === "not_interested") {
    await db.query("update conversations set outcome = 'not_interested', updated_at = now() where athlete_id = $1", [athlete.id]);
    await suppressAthlete(db, athlete.id, opts.optOut ? "opt_out" : "declined", {
      source: opts.source === "auto" ? "auto" : "manual",
      note: opts.excerpt,
    });
    return;
  }
  // A positive or neutral reply means a human takes over: no more automated messages.
  await stopAutomation(db, athlete.id, "athlete replied", { cancelIntro: false });
  await db.query("update conversations set outcome = $2, updated_at = now() where athlete_id = $1", [athlete.id, category]);
  if (category === "interested") {
    await db.query("update athletes set status = 'interested', updated_at = now() where id = $1", [athlete.id]);
    await ensureLead(db, athlete.id);
    await createAlert(db, {
      kind: "interested",
      title: `${athlete.full_name} is interested`,
      body: opts.excerpt,
      athleteId: athlete.id,
      messageId,
    });
  } else {
    await db.query("update athletes set status = 'replied', updated_at = now() where id = $1 and status in ('contacted','replied','queued')", [athlete.id]);
    await createAlert(db, { kind: "question", title: `${athlete.full_name} replied`, body: opts.excerpt, athleteId: athlete.id, messageId });
  }
}

const excerpt = (t: string) => (t.length > 200 ? `${t.slice(0, 197)}...` : t);

/** Stores an inbound reply (idempotent per adapter + external id), classifies it, and applies its effects. */
export async function ingestInbound(db: Db, adapterId: string, m: InboundMessage): Promise<IngestResult> {
  let conv: { id: string; athlete_id: string } | undefined;
  if (m.threadId) {
    [conv] = await db.query<{ id: string; athlete_id: string }>(
      "select id, athlete_id from conversations where adapter = $1 and thread_id = $2", [adapterId, m.threadId]);
  }
  if (!conv && (m.athleteProfileUrl || m.athleteVolleyboxId)) {
    [conv] = await db.query<{ id: string; athlete_id: string }>(
      `select c.id, c.athlete_id from conversations c join athletes a on a.id = c.athlete_id
       where a.profile_url = $1 or ($2::text is not null and a.volleybox_id = $2) limit 1`,
      [m.athleteProfileUrl ?? "", m.athleteVolleyboxId ?? null]);
  }
  if (!conv) {
    await logEvent(db, "warn", "responses", `Inbound message ${m.externalId} could not be matched to a contacted athlete.`);
    return { status: "unmatched" };
  }

  const verdict = classifyReply(m.body);
  const inserted = await db.query<{ id: string }>(
    `insert into messages (athlete_id, conversation_id, direction, kind, language, body, status, adapter, external_id,
       received_at, category, category_source, confidence, needs_review, requires_approval)
     values ($1, $2, 'in', 'inbound', 'en', $3, 'received', $4, $5, $6, $7, 'auto', $8, $9, false)
     on conflict (adapter, external_id) where direction = 'in' and external_id is not null do nothing
     returning id`,
    [conv.athlete_id, conv.id, m.body, adapterId, m.externalId, m.receivedAt, verdict.category, verdict.confidence, verdict.needsReview],
  );
  if (!inserted.length) return { status: "duplicate" };

  const [athlete] = await db.query<AthleteLite>("select id, full_name, first_name, status from athletes where id = $1", [conv.athlete_id]);
  await db.query(
    "update conversations set last_inbound_at = greatest(coalesce(last_inbound_at, $2), $2), updated_at = now() where id = $1",
    [conv.id, m.receivedAt],
  );
  await applyCategory(db, athlete, inserted[0].id, verdict.category, { optOut: verdict.optOut, source: "auto", excerpt: excerpt(m.body) });
  await logEvent(db, "info", "responses", `Reply classified as ${verdict.category} (${verdict.confidence.toFixed(2)})`, { athleteId: athlete.id });
  return { status: "stored", messageId: inserted[0].id, category: verdict.category };
}

/** Manual correction from the inbox. Only the newest reply drives the conversation outcome. */
export async function reclassifyMessage(db: Db, messageId: string, category: ReplyCategory) {
  const [msg] = await db.query<{ athlete_id: string; body: string; received_at: Date }>(
    "select athlete_id, body, received_at from messages where id = $1 and direction = 'in'", [messageId]);
  if (!msg) throw new Error("Reply not found");
  await db.query("update messages set category = $2, category_source = 'manual', needs_review = false, updated_at = now() where id = $1", [messageId, category]);
  const [latest] = await db.query<{ id: string }>(
    "select id from messages where athlete_id = $1 and direction = 'in' order by received_at desc, created_at desc limit 1", [msg.athlete_id]);
  if (latest?.id !== messageId) return;

  const [athlete] = await db.query<AthleteLite>("select id, full_name, first_name, status from athletes where id = $1", [msg.athlete_id]);
  if (category !== "not_interested") {
    // Undo an automatic decline that was classified wrongly; explicit opt-outs stay in force.
    await db.query("delete from suppressions where athlete_id = $1 and source = 'auto' and reason = 'declined'", [athlete.id]);
    const left = await db.query("select 1 from suppressions where athlete_id = $1", [athlete.id]);
    if (!left.length) await db.query("update athletes set status = 'replied', updated_at = now() where id = $1 and status = 'suppressed'", [athlete.id]);
    else return;
  }
  await applyCategory(db, athlete, messageId, category, { optOut: false, source: "manual", excerpt: excerpt(msg.body) });
}

/** Pulls replies from the authorized integration (if it supports polling) and ingests them. */
export async function pollReplies(db: Db, adapter: MessagingAdapter) {
  const s = await getSettings(db);
  const { messages, cursor } = await adapter.fetchReplies(s.replies_cursor);
  const counts = { stored: 0, duplicate: 0, unmatched: 0 };
  for (const m of messages) counts[(await ingestInbound(db, adapter.id, m)).status]++;
  if (cursor !== s.replies_cursor) await updateSettings(db, { replies_cursor: cursor });
  return counts;
}

/** Marks conversations "No Response" once the whole follow-up sequence has gone unanswered. */
export async function markNoResponse(db: Db, now = new Date()) {
  const s = await getSettings(db);
  const rows = await db.query<{ id: string }>(
    `update conversations c set outcome = 'no_response', status = 'closed', stop_reason = 'no_response', updated_at = now()
     where c.status = 'active' and c.outcome = 'pending' and c.last_inbound_at is null
       and c.last_outbound_at <= $1
       and (c.followups_sent >= $2 or not $3::boolean)
       and not exists (select 1 from messages m where m.athlete_id = c.athlete_id and m.direction = 'out'
                       and m.status in ('pending_approval','approved','sending'))
     returning c.id`,
    [addDays(now, -s.no_response_after_days), s.max_followups, s.followups_enabled],
  );
  if (rows.length) await logEvent(db, "info", "responses", `Marked ${rows.length} conversation(s) as No Response.`);
  return rows.length;
}

export async function safeIngest(db: Db, adapterId: string, m: InboundMessage) {
  try {
    return await ingestInbound(db, adapterId, m);
  } catch (err) {
    await logEvent(db, "error", "responses", `Failed to ingest inbound message: ${errMessage(err)}`);
    throw err;
  }
}
