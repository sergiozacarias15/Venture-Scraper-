import { notFound } from "next/navigation";
import {
  guardianConsentAction, logReplyAction, moveChannelAction, restoreAthleteAction, suppressAthleteAction, updateLeadAction,
} from "@/app/actions";
import { Flash } from "@/components/flash";
import { Badge, btn, Card, fmtDate, input, PageHeader, StatusBadge } from "@/components/ui";
import { getDb } from "@/lib/db";
import { LEAD_STATUSES } from "@/modules/leads/service";
import { ageBounds, isPotentialMinor } from "@/modules/messaging/safeguards";

export const dynamic = "force-dynamic";

export default async function AthletePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  const db = getDb();
  const [a] = await db.query<any>("select * from athletes where id = $1", [id]).catch(() => []);
  if (!a) notFound();
  const [conv] = await db.query<any>("select * from conversations where athlete_id = $1", [id]);
  const [lead] = await db.query<any>("select * from leads where athlete_id = $1", [id]);
  const [sup] = await db.query<any>("select * from suppressions where athlete_id = $1", [id]);
  const msgs = await db.query<any>("select * from messages where athlete_id = $1 order by coalesce(sent_at, received_at, created_at)", [id]);
  const minor = isPotentialMinor(a);
  const bounds = ageBounds(a);
  const conversationUrl = conv?.conversation_url;

  return (
    <>
      <PageHeader title={a.full_name} description={[a.position, a.club, a.nationality].filter(Boolean).join(" - ")}>
        <a className={btn.secondary} href={a.profile_url} target="_blank" rel="noreferrer">Open Volleybox profile</a>
        {conversationUrl && <a className={btn.secondary} href={conversationUrl} target="_blank" rel="noreferrer">Open conversation</a>}
      </PageHeader>
      <Flash ok={ok} error={error} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Conversation">
            {msgs.length === 0 && <p className="text-sm text-slate-500">No messages yet.</p>}
            <ul className="space-y-3">
              {msgs.map((m: any) => (
                <li key={m.id} className={`rounded-lg border p-3 text-sm ${m.direction === "in" ? "border-violet-200 bg-violet-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium">{m.direction === "in" ? a.first_name : "You"}</span>
                    <StatusBadge status={m.status} />
                    {m.kind !== "inbound" && <Badge>{m.kind} / {m.language}</Badge>}
                    {m.category && <StatusBadge status={m.category} />}
                    {m.needs_review && <Badge tone="amber">needs review</Badge>}
                    <span>{fmtDate(m.sent_at ?? m.received_at ?? m.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  {m.last_error && <p className="mt-1 text-xs text-red-700">{m.last_error}</p>}
                </li>
              ))}
            </ul>
            {conv && (
              <form action={logReplyAction} className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <input type="hidden" name="athleteId" value={id} />
                <label className="text-sm font-medium">Log a reply you received on Volleybox</label>
                <textarea name="body" rows={3} required placeholder="Paste the athlete's reply. It is classified automatically (Interested, Not interested, Question)." className={input} />
                <button className={btn.secondary}>Log reply</button>
              </form>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Profile">
            <dl className="grid grid-cols-3 gap-y-1.5 text-sm">
              <dt className="text-slate-500">Status</dt><dd className="col-span-2"><StatusBadge status={a.status} /></dd>
              <dt className="text-slate-500">Born</dt><dd className="col-span-2">{a.birth_date ? String(a.birth_date).slice(0, 10) : a.birth_year ?? "-"}{bounds && ` (age ${bounds.min === bounds.max ? bounds.min : `${bounds.min}-${bounds.max}`})`}</dd>
              <dt className="text-slate-500">Gender</dt><dd className="col-span-2">{a.gender ?? "-"}</dd>
              <dt className="text-slate-500">Language</dt><dd className="col-span-2">{a.preferred_language ?? "unknown"}</dd>
              <dt className="text-slate-500">Instagram</dt><dd className="col-span-2">{a.instagram ? <a className="underline" href={`https://instagram.com/${a.instagram}`} target="_blank" rel="noreferrer">@{a.instagram}</a> : "-"}</dd>
              <dt className="text-slate-500">Source</dt><dd className="col-span-2">{a.source}</dd>
              <dt className="text-slate-500">Discovered</dt><dd className="col-span-2">{fmtDate(a.discovered_at)}</dd>
            </dl>
            {minor && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Potential minor: every message needs your approval, messages are guardian-aware, and moving to WhatsApp/Instagram requires recorded guardian involvement.</p>}
          </Card>

          {(lead || a.status === "interested") && (
            <Card title="Lead">
              <form action={updateLeadAction} className="space-y-2">
                <input type="hidden" name="athleteId" value={id} />
                <select name="status" defaultValue={lead?.status ?? "new"} className={input}>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select>
                <textarea name="notes" rows={3} defaultValue={lead?.notes ?? ""} placeholder="Notes" className={input} />
                <button className={btn.secondary}>Save</button>
              </form>
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-2 text-sm font-medium">Continue personally</p>
                {lead?.off_platform_channel && <p className="mb-2 text-sm text-emerald-700">Moved to {lead.off_platform_channel} on {fmtDate(lead.moved_at)}</p>}
                <div className="flex gap-2">
                  {["whatsapp", "instagram"].map((c) => (
                    <form action={moveChannelAction} key={c}>
                      <input type="hidden" name="athleteId" value={id} /><input type="hidden" name="channel" value={c} />
                      <button className={btn.primary}>Mark moved to {c === "whatsapp" ? "WhatsApp" : "Instagram"}</button>
                    </form>
                  ))}
                </div>
                {minor && (
                  <div className="mt-3">
                    {lead?.guardian_consent_at ? (
                      <p className="text-sm text-emerald-700">Guardian involvement recorded {fmtDate(lead.guardian_consent_at)}: {lead.guardian_note}</p>
                    ) : (
                      <form action={guardianConsentAction} className="space-y-2">
                        <input type="hidden" name="athleteId" value={id} />
                        <input name="note" required placeholder="How was a parent/guardian involved? (who, when, where)" className={input} />
                        <button className={btn.secondary}>Record guardian involvement</button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card title="Actions">
            {sup ? (
              <p className="text-sm text-red-700">On the suppression list ({sup.reason}). No messages will be sent.</p>
            ) : (
              <form action={suppressAthleteAction} className="space-y-2">
                <input type="hidden" name="athleteId" value={id} />
                <input name="note" placeholder="Reason (optional)" className={input} />
                <button className={btn.danger}>Suppress: never contact</button>
              </form>
            )}
            {a.status === "excluded" && (
              <form action={restoreAthleteAction} className="mt-3">
                <input type="hidden" name="athleteId" value={id} />
                <p className="mb-1 text-xs text-slate-500">Excluded: {a.excluded_reason?.replace(/_/g, " ")}</p>
                <button className={btn.secondary}>Restore to discovery pool</button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
