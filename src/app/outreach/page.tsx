import { approveAction, cancelMessageAction, planNowAction, saveDraftAction } from "../actions";
import { Flash } from "@/components/flash";
import { ModeBanner } from "@/components/mode-banner";
import { Badge, btn, Card, fmtDate, input, PageHeader, StatusBadge, Table } from "@/components/ui";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { isPotentialMinor } from "@/modules/messaging/safeguards";

export const dynamic = "force-dynamic";
const TABS = [["pending_approval", "Awaiting approval"], ["approved", "Approved / scheduled"], ["sent", "Sent"], ["failed", "Failed"], ["cancelled", "Cancelled"]] as const;

export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.some(([t]) => t === sp.tab) ? sp.tab! : "pending_approval";
  const db = getDb();
  const s = await getSettings(db);
  const counts = Object.fromEntries((await db.query<{ status: string; n: number }>(
    "select status, count(*)::int n from messages where direction = 'out' group by status")).map((r) => [r.status, r.n]));
  const rows = await db.query<any>(
    `select m.*, a.full_name, a.birth_year, a.birth_date, a.nationality, a.profile_url
     from messages m join athletes a on a.id = m.athlete_id
     where m.direction = 'out' and m.status = $1
     order by ${tab === "sent" ? "m.sent_at desc" : "m.created_at"} limit 100`, [tab]);
  const [{ n: sent24 }] = await db.query<{ n: number }>("select count(*)::int n from messages where direction='out' and status='sent' and sent_at > now() - interval '24 hours'");
  const here = `/outreach?tab=${tab}`;
  const adultRows = rows.filter((r) => !isPotentialMinor(r));

  return (
    <>
      <PageHeader title="Outreach queue" description="Drafts are generated automatically. Adults can be auto-approved in Settings; anyone who may be under 18 always needs your approval.">
        <form action={planNowAction}><input type="hidden" name="returnTo" value={here} /><button className={btn.secondary}>Generate drafts now</button></form>
      </PageHeader>
      <Flash ok={sp.ok} error={sp.error} />
      <ModeBanner settings={s} returnTo={here} />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span>Sending: <strong>{s.outreach_enabled ? "on" : "off"}</strong></span>
          <span>Last 24h: <strong>{sent24}/{s.daily_cap}</strong></span>
          <span>Window: <strong>{s.window_start_hour}:00-{s.window_end_hour}:00 {s.timezone}</strong></span>
          <span>Min gap: <strong>{s.min_interval_seconds}s</strong></span>
          <span>Auto-approve adults: <strong>{s.auto_approve_adults ? "yes" : "no"}</strong></span>
          <a className="underline" href="/settings">Change schedule</a>
        </div>
      </Card>

      <div className="mb-3 flex flex-wrap gap-1">
        {TABS.map(([t, label]) => (
          <a key={t} href={`/outreach?tab=${t}`} className={`rounded-lg px-3 py-1.5 text-sm ${tab === t ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"}`}>
            {label} <span className="opacity-70">{counts[t] ?? 0}</span>
          </a>
        ))}
      </div>

      {tab === "pending_approval" && adultRows.length > 0 && (
        <form action={approveAction} className="mb-3 flex items-center gap-3">
          <input type="hidden" name="returnTo" value={here} />
          {adultRows.map((r) => <input key={r.id} type="hidden" name="ids" value={r.id} />)}
          <button className={btn.primary}>Approve {adultRows.length} adult draft{adultRows.length === 1 ? "" : "s"}</button>
          <span className="text-xs text-slate-500">Drafts for potential minors are never bulk-approved; review them one by one.</span>
        </form>
      )}

      <Table head={["Athlete", "Message", "Details", "Actions"]} empty={rows.length ? undefined : "Nothing here."}>
        {rows.map((m) => (
          <tr key={m.id}>
            <td className="w-48 px-3 py-2">
              <a className="font-medium underline" href={`/athletes/${m.athlete_id}`}>{m.full_name}</a>
              <div className="text-xs text-slate-500">{m.nationality} - {m.birth_year}</div>
              {isPotentialMinor(m) && <Badge tone="amber">potential minor</Badge>}
              <div className="mt-1"><a className="text-xs text-sky-700 underline" href={m.profile_url} target="_blank" rel="noreferrer">Volleybox profile</a></div>
            </td>
            <td className="px-3 py-2">
              {tab === "pending_approval" ? (
                <form action={saveDraftAction} className="space-y-1">
                  <input type="hidden" name="id" value={m.id} /><input type="hidden" name="returnTo" value={here} />
                  <textarea name="body" rows={5} defaultValue={m.body} className={`${input} text-xs`} />
                  <button className={`${btn.secondary} ${btn.small}`}>Save edits</button>
                </form>
              ) : <p className="max-w-xl whitespace-pre-wrap">{m.body}</p>}
              {m.last_error && <p className="mt-1 text-xs text-red-700">{m.last_error}</p>}
            </td>
            <td className="w-44 px-3 py-2 text-xs text-slate-600">
              <div className="flex flex-wrap gap-1"><Badge>{m.kind}</Badge><Badge>{m.language}</Badge><StatusBadge status={m.status} /></div>
              {m.sent_at && <div className="mt-1">Sent {fmtDate(m.sent_at)}</div>}
              {m.status === "approved" && <div className="mt-1">Due {fmtDate(m.send_after)}</div>}
              {m.attempts > 0 && <div className="mt-1">Attempts: {m.attempts}/{m.max_attempts}</div>}
            </td>
            <td className="w-40 px-3 py-2">
              <div className="flex flex-col gap-1">
                {m.status === "pending_approval" && (
                  <form action={approveAction}><input type="hidden" name="ids" value={m.id} /><input type="hidden" name="returnTo" value={here} /><button className={`${btn.primary} ${btn.small} w-full`}>Approve</button></form>
                )}
                {["pending_approval", "approved"].includes(m.status) && (
                  <form action={cancelMessageAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="returnTo" value={here} /><button className={`${btn.danger} ${btn.small} w-full`}>Cancel</button></form>
                )}
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
