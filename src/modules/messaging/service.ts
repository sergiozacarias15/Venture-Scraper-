import { createAlert } from "@/lib/alerts";
import { pickLanguage } from "@/lib/countries";
import type { Db } from "@/lib/db";
import { errMessage, logEvent } from "@/lib/logger";
import { getSettings, updateSettings } from "@/lib/settings";
import { addDays, addMinutes } from "@/lib/time";
import {
  PermanentSendError, SendBlockedError, TransientSendError, type MessagingAdapter,
} from "./adapters/types";
import { evaluateSendGate, nextAttemptAt } from "./schedule";
import { checkContactEligibility, isPotentialMinor, requiresHumanApproval } from "./safeguards";
import { MAX_MESSAGE_LENGTH, renderMessage } from "./templates";

type AthleteRow = {
  id: string; profile_url: string; volleybox_id: string | null; first_name: string; birth_year: number | null;
  birth_date: string | Date | null; nationality: string | null; preferred_language: string | null;
  position: string | null; club: string | null; status: string; first_contacted_at: Date | null;
};

const IN_FLIGHT = "('pending_approval','approved','sending')";

async function draftMessage(
  db: Db, a: AthleteRow, kind: "intro" | "followup", conversationId: string | null,
  settings: Awaited<ReturnType<typeof getSettings>>, now: Date,
) {
  const language = pickLanguage(a.preferred_language, a.nationality);
  const minor = isPotentialMinor(a, now);
  const body = renderMessage({
    language, kind, minor, firstName: a.first_name, senderName: settings.sender_name.trim(),
    org: settings.sender_org.trim(), position: a.position, club: a.club,
  });
  const needsApproval = requiresHumanApproval(a, settings.auto_approve_adults, now);
  const rows = await db.query<{ id: string }>(
    `insert into messages (athlete_id, conversation_id, direction, kind, language, body, status, requires_approval, approved_at, approved_by, send_after)
     values ($1,$2,'out',$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (athlete_id) where kind = 'intro' and status <> 'cancelled' do nothing
     returning id`,
    [a.id, conversationId, kind, language, body, needsApproval ? "pending_approval" : "approved", needsApproval,
      needsApproval ? null : now, needsApproval ? null : "auto", now],
  );
  return rows[0]?.id ?? null;
}

/** Drafts introductory messages for newly discovered, eligible athletes (bounded by the backlog cap). */
export async function planIntros(db: Db, now = new Date()) {
  const s = await getSettings(db);
  if (!s.sender_name.trim()) {
    await logEvent(db, "warn", "outreach", "Intro planning skipped: set a sender name in Settings.");
    return { planned: 0, excluded: 0, skipped: "sender_name_missing" as const };
  }
  const [{ n }] = await db.query<{ n: number }>(`select count(*)::int as n from messages where direction = 'out' and status in ${IN_FLIGHT}`);
  const room = s.plan_backlog_cap - n;
  if (room <= 0) return { planned: 0, excluded: 0, skipped: "backlog_full" as const };

  const candidates = await db.query<AthleteRow>(
    `select a.* from athletes a
     where a.status = 'discovered'
       and not exists (select 1 from suppressions x where x.profile_url = a.profile_url)
       and not exists (select 1 from messages m where m.athlete_id = a.id and m.kind = 'intro' and m.status <> 'cancelled')
       and a.birth_year = any($1::int[]) and a.nationality = any($2::text[])
       and (cardinality($3::text[]) = 0 or a.gender = any($3::text[]))
       and (cardinality($4::text[]) = 0 or a.position = any($4::text[]))
     order by a.discovered_at, a.id limit $5`,
    [s.criteria_birth_years, s.criteria_countries, s.criteria_genders, s.criteria_positions, room + 100],
  );
  let planned = 0;
  let excluded = 0;
  for (const a of candidates) {
    if (planned >= room) break;
    const eligibility = checkContactEligibility(a, s.min_contact_age, now);
    if (!eligibility.eligible) {
      await db.query("update athletes set status='excluded', excluded_reason=$2, updated_at=now() where id=$1", [a.id, eligibility.reason]);
      excluded++;
      continue;
    }
    const created = await db.tx(async (tx) => {
      const id = await draftMessage(tx, a, "intro", null, s, now);
      if (id) await tx.query("update athletes set status='queued', updated_at=now() where id=$1", [a.id]);
      return id;
    });
    if (created) planned++;
  }
  if (planned || excluded) await logEvent(db, "info", "outreach", `Planned ${planned} intro message(s), excluded ${excluded}.`);
  return { planned, excluded };
}

/** Drafts follow-ups for contacted athletes with no reply. Never for declined/replied/suppressed athletes. */
export async function planFollowups(db: Db, now = new Date()) {
  const s = await getSettings(db);
  if (!s.followups_enabled || s.max_followups < 1 || !s.sender_name.trim()) return { planned: 0 };
  const due = await db.query<AthleteRow & { conversation_id: string }>(
    `select a.*, c.id as conversation_id from conversations c
     join athletes a on a.id = c.athlete_id
     where c.status = 'active' and c.outcome = 'pending' and c.last_inbound_at is null
       and c.followups_sent < $1 and c.last_outbound_at <= $2
       and a.status = 'contacted'
       and not exists (select 1 from suppressions x where x.profile_url = a.profile_url)
       and not exists (select 1 from messages m where m.athlete_id = a.id and m.direction = 'out' and m.kind = 'followup' and m.status in ${IN_FLIGHT})
     order by c.last_outbound_at limit 100`,
    [s.max_followups, addDays(now, -s.followup_delay_days)],
  );
  let planned = 0;
  for (const a of due) {
    if (await draftMessage(db, a, "followup", a.conversation_id, s, now)) planned++;
  }
  if (planned) await logEvent(db, "info", "outreach", `Planned ${planned} follow-up(s).`);
  return { planned };
}

type QueuedMessage = {
  id: string; athlete_id: string; conversation_id: string | null; kind: string; body: string; language: string;
  attempts: number; max_attempts: number; requires_approval: boolean; approved_at: Date | null;
};

async function claimNext(db: Db, now: Date): Promise<QueuedMessage | null> {
  const rows = await db.query<QueuedMessage>(
    `update messages set status = 'sending', attempts = attempts + 1, updated_at = now()
     where id = (
       select id from messages
       where direction = 'out' and status = 'approved' and send_after <= $1
       order by (kind = 'intro') asc, send_after, created_at
       for update skip locked limit 1)
     returning id, athlete_id, conversation_id, kind, body, language, attempts, max_attempts, requires_approval, approved_at`,
    [now],
  );
  return rows[0] ?? null;
}

/** Returns a cancel reason if the message must not be sent, re-checked at send time. */
async function preflight(db: Db, m: QueuedMessage, minContactAge: number, now: Date): Promise<string | "needs_approval" | null> {
  const [a] = await db.query<AthleteRow>("select * from athletes where id = $1", [m.athlete_id]);
  if (!a) return "athlete missing";
  if (["suppressed", "not_interested", "excluded", "unreachable"].includes(a.status)) return `athlete is ${a.status}`;
  const sup = await db.query("select 1 from suppressions where profile_url = $1", [a.profile_url]);
  if (sup.length) return "athlete is on the suppression list";
  if (m.requires_approval && !m.approved_at) return "needs_approval";
  const eligibility = checkContactEligibility(a, minContactAge, now);
  if (!eligibility.eligible) return `safeguard: ${eligibility.reason}`;
  if (m.kind === "intro") {
    const dup = await db.query("select 1 from messages where athlete_id = $1 and kind = 'intro' and status = 'sent' and id <> $2", [a.id, m.id]);
    if (dup.length || a.first_contacted_at) return "duplicate: athlete was already contacted";
  } else if (m.kind === "followup") {
    const [c] = await db.query<{ status: string; outcome: string; last_inbound_at: Date | null }>(
      "select status, outcome, last_inbound_at from conversations where id = $1", [m.conversation_id]);
    if (!c || c.status !== "active" || c.outcome !== "pending" || c.last_inbound_at) return "conversation is no longer eligible for follow-up";
  }
  return null;
}

export type SendRunResult = { sent: number; cancelled: number; failed: number; stoppedReason?: string };

const MAX_PER_RUN = 50;

/** Sends due approved messages through the adapter, enforcing schedule, caps, and Volleybox's own limits. */
export async function sendDueMessages(db: Db, adapter: MessagingAdapter, now = new Date()): Promise<SendRunResult> {
  const result: SendRunResult = { sent: 0, cancelled: 0, failed: 0 };
  await db.query(
    `update messages set status = 'failed', last_error = 'Interrupted while sending; check Volleybox before retrying.', updated_at = now()
     where direction = 'out' and status = 'sending' and updated_at < $1`,
    [addMinutes(now, -15)],
  );

  for (let i = 0; i < MAX_PER_RUN; i++) {
    const s = await getSettings(db);
    const [stats] = await db.query<{ n: number; last: Date | null }>(
      `select count(*) filter (where sent_at > $1)::int as n, max(sent_at) as last
       from messages where direction = 'out' and status = 'sent'`,
      [addDays(now, -1)],
    );
    const gate = evaluateSendGate({ now, settings: s, sentLast24h: stats.n, lastSentAt: stats.last });
    if (!gate.allowed) {
      result.stoppedReason = gate.reason;
      break;
    }
    const m = await claimNext(db, now);
    if (!m) break;

    const block = await preflight(db, m, s.min_contact_age, now);
    if (block === "needs_approval") {
      await db.query("update messages set status = 'pending_approval', attempts = attempts - 1, updated_at = now() where id = $1", [m.id]);
      continue;
    }
    if (block) {
      await db.query("update messages set status = 'cancelled', last_error = $2, updated_at = now() where id = $1", [m.id, `Cancelled at send time: ${block}`]);
      await logEvent(db, "warn", "outreach", `Cancelled message at send time: ${block}`, { athleteId: m.athlete_id });
      result.cancelled++;
      continue;
    }

    const [a] = await db.query<AthleteRow>("select * from athletes where id = $1", [m.athlete_id]);
    const [conv] = m.conversation_id
      ? await db.query<{ thread_id: string | null }>("select thread_id from conversations where id = $1", [m.conversation_id])
      : [];
    try {
      const sent = await adapter.send({
        messageId: m.id,
        athlete: { id: a.id, profileUrl: a.profile_url, volleyboxId: a.volleybox_id },
        body: m.body,
        language: m.language,
        threadId: conv?.thread_id ?? null,
      });
      await db.tx(async (tx) => {
        await tx.query("update messages set status='sent', sent_at=$2, external_id=$3, adapter=$4, last_error=null, updated_at=now() where id=$1",
          [m.id, now, sent.externalId, adapter.id]);
        const [c] = await tx.query<{ id: string }>(
          `insert into conversations (athlete_id, adapter, thread_id, conversation_url, last_outbound_at, followups_sent)
           values ($1,$2,$3,$4,$5,$6)
           on conflict (athlete_id) do update set thread_id = coalesce(excluded.thread_id, conversations.thread_id),
             conversation_url = coalesce(excluded.conversation_url, conversations.conversation_url),
             last_outbound_at = excluded.last_outbound_at,
             followups_sent = conversations.followups_sent + $6, updated_at = now()
           returning id`,
          [a.id, adapter.id, sent.threadId, sent.conversationUrl ?? adapter.conversationUrl(sent.threadId, a.profile_url), now, m.kind === "followup" ? 1 : 0],
        );
        await tx.query("update messages set conversation_id = $2 where id = $1", [m.id, c.id]);
        await tx.query(
          "update athletes set status = case when status in ('queued','discovered') then 'contacted' else status end, first_contacted_at = coalesce(first_contacted_at, $2), updated_at = now() where id = $1",
          [a.id, now],
        );
      });
      result.sent++;
    } catch (err) {
      if (err instanceof SendBlockedError) {
        await db.query("update messages set status='approved', attempts = attempts - 1, last_error=$2, updated_at=now() where id=$1", [m.id, err.message]);
        const hard = err.kind === "captcha" || err.kind === "account_restricted" || err.kind === "messaging_disabled";
        const until = err.retryAfter ?? (hard ? addDays(now, 3650) : addMinutes(now, 60));
        await updateSettings(db, {
          sending_paused_until: until,
          sending_paused_reason: `${err.kind}: ${err.message}`,
        });
        await createAlert(db, {
          kind: "sending_paused",
          title: "Sending paused by Volleybox",
          body: `${err.kind}: ${err.message}. ${hard ? "Resolve this in Volleybox, then resume sending manually." : "Will retry after the pause."}`,
        });
        await logEvent(db, "error", "outreach", `Sending paused (${err.kind}): ${err.message}`);
        result.stoppedReason = err.kind;
        break;
      }
      const permanent = err instanceof PermanentSendError;
      const exhausted = m.attempts >= m.max_attempts;
      if (permanent || exhausted || !(err instanceof TransientSendError)) {
        await db.query("update messages set status='failed', last_error=$2, updated_at=now() where id=$1", [m.id, errMessage(err)]);
        if (permanent) await db.query("update athletes set status='unreachable', updated_at=now() where id=$1 and status in ('queued','contacted')", [a.id]);
        await createAlert(db, { kind: "send_failed", title: "Message failed to send", body: errMessage(err), athleteId: a.id, messageId: m.id });
        await logEvent(db, "error", "outreach", `Message failed: ${errMessage(err)}`, { athleteId: a.id });
        result.failed++;
        continue;
      }
      await db.query("update messages set status='approved', send_after=$2, last_error=$3, updated_at=now() where id=$1",
        [m.id, nextAttemptAt(now, m.attempts), errMessage(err)]);
      await logEvent(db, "warn", "outreach", `Transient send error, will retry: ${errMessage(err)}`, { athleteId: a.id });
      result.stoppedReason = "transient_error";
      break;
    }
  }
  if (result.sent || result.failed || result.cancelled) {
    await logEvent(db, "info", "outreach", `Send run: ${result.sent} sent, ${result.cancelled} cancelled, ${result.failed} failed.`);
  }
  return result;
}

export async function approveMessages(db: Db, ids: string[], by = "operator") {
  if (!ids.length) return 0;
  const rows = await db.query<{ id: string }>(
    `update messages m set status = 'approved', approved_at = now(), approved_by = $2, updated_at = now()
     where m.id = any($1::uuid[]) and m.status = 'pending_approval' and m.direction = 'out'
       and not exists (select 1 from athletes a where a.id = m.athlete_id and a.status in ('suppressed','not_interested','excluded','unreachable'))
     returning m.id`,
    [ids, by],
  );
  return rows.length;
}

export async function updateDraftBody(db: Db, id: string, body: string) {
  const text = body.trim();
  if (!text) throw new Error("Message cannot be empty.");
  if (text.length > MAX_MESSAGE_LENGTH) throw new Error(`Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`);
  const rows = await db.query("update messages set body = $2, updated_at = now() where id = $1 and status = 'pending_approval' returning id", [id, text]);
  if (!rows.length) throw new Error("Only drafts awaiting approval can be edited.");
}

export async function cancelMessage(db: Db, id: string) {
  const rows = await db.query<{ athlete_id: string; kind: string }>(
    "update messages set status = 'cancelled', last_error = 'Cancelled by operator', updated_at = now() where id = $1 and status in ('pending_approval','approved') returning athlete_id, kind",
    [id],
  );
  if (rows[0]?.kind === "intro") {
    await db.query("update athletes set status='excluded', excluded_reason='rejected_in_review', updated_at=now() where id=$1 and status='queued'", [rows[0].athlete_id]);
  }
  return rows.length > 0;
}

export async function restoreAthlete(db: Db, athleteId: string) {
  await db.query("update athletes set status='discovered', excluded_reason=null, updated_at=now() where id=$1 and status='excluded'", [athleteId]);
}

export async function resumeSending(db: Db) {
  await updateSettings(db, { sending_paused_until: null, sending_paused_reason: null });
  await logEvent(db, "info", "outreach", "Sending resumed by operator.");
}
