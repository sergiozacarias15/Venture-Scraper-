import { approveAction, cancelMessageAction, cannotMessageAction, confirmSentAction, planNowAction, platformLimitAction, saveDraftAction } from "../actions";
import { CopyButton } from "@/components/copy-button";
import { Flash } from "@/components/flash";
import { ModeBanner } from "@/components/mode-banner";
import { Badge, btn, Card, fmtDate, input, PageHeader, StatusBadge, Table } from "@/components/ui";
import { getDb } from "@/lib/db";
import { getVolleyboxMode } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { isPotentialMinor } from "@/modules/messaging/safeguards";
import { INBOX_URL_PREFIX } from "@/modules/volleybox/interfaces";

export const dynamic = "force-dynamic";
const TABS = [["pending_approval", "Awaiting approval"], ["approved", "Ready to send"], ["sent", "Sent"], ["failed", "Failed"], ["cancelled", "Cancelled"]] as const;

export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const assisted = getVolleyboxMode().mode === "assisted";
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
      <PageHeader title="Outreach queue" description="Drafts are generated automatically. Approve them, then send each one on Volleybox and confirm here. Anyone who may be under 18 always needs your explicit approval.">
        <form action={planNowAction}><input type="hidden" name="returnTo" value={here} /><button className={btn.secondary}>Generate drafts now</button></form>
      </PageHeader>
      <Flash ok={sp.ok} error={sp.error} />
      <ModeBanner settings={s} returnTo={here} />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          {!assisted && <span>Auto-sending: <strong>{s.outreach_enabled ? "on" : "off"}</strong></span>}
          <span>Sent in last 24h: <strong>{sent24}/{s.daily_cap}</strong></span>
          {!assisted && <span>Window: <strong>{s.window_start_hour}:00-{s.window_end_hour}:00 {s.timezone}</strong></span>}
          <span>Min gap between messages: <strong>{s.min_interval_seconds}s</strong></span>
          <span>Auto-approve adults: <strong>{s.auto_approve_adults ? "yes" : "no"}</strong></span>
          <a className="underline" href="/settings">Change schedule</a>
        </div>
      </Card>

      {assisted && tab === "approved" && (
        <Card title="How sending works" className="mb-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li>Click <strong>Open profile</strong> and start a private message from Volleybox (you must be signed in to your own account).</li>
            <li>Click <strong>Copy message</strong>, paste it into Volleybox&apos;s composer, and press Volleybox&apos;s send button yourself.</li>
            <li>Copy the conversation address from your browser (<code>{INBOX_URL_PREFIX}&#123;conversation_id&#125;</code>), paste it next to <strong>I sent it</strong>, and confirm. The app stores the link so you can open it later to check for a reply, enforces your daily cap and gap, and starts the follow-up timer.</li>
          </ol>
          <p className="mt-2 text-xs text-slate-500">If Volleybox shows a CAPTCHA, a sending limit or restricts your account, stop and report it below: the app pauses everything. It never works around those controls. If an athlete does not accept messages from you, use &quot;Can&apos;t message&quot;.</p>
          <form action={platformLimitAction} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="returnTo" value={here} />
            <input name="note" placeholder="What did Volleybox show? (optional)" className={`${input} max-w-sm`} />
            <button className={`${btn.danger} ${btn.small}`}>Volleybox limited me: pause sending</button>
          </form>
        </Card>
      )}

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
              {m.status === "approved" && !assisted && <div className="mt-1">Due {fmtDate(m.send_after)}</div>}
              {m.attempts > 0 && <div className="mt-1">Attempts: {m.attempts}/{m.max_attempts}</div>}
            </td>
            <td className="w-52 px-3 py-2">
              <div className="flex flex-col gap-1">
                {m.status === "pending_approval" && (
                  <form action={approveAction}><input type="hidden" name="ids" value={m.id} /><input type="hidden" name="returnTo" value={here} /><button className={`${btn.primary} ${btn.small} w-full`}>Approve</button></form>
                )}
                {assisted && m.status === "approved" && (
                  <>
                    <a className={`${btn.secondary} ${btn.small} w-full`} href={m.profile_url} target="_blank" rel="noreferrer">Open profile</a>
                    <CopyButton text={m.body} />
                    <form action={confirmSentAction} className="flex flex-col gap-1">
                      <input type="hidden" name="id" value={m.id} /><input type="hidden" name="returnTo" value={here} />
                      <input name="conversation" placeholder="volleybox.net/pm/inbox/..." aria-label="Volleybox conversation link" className={`${input} !py-1 text-xs`} />
                      <button className={`${btn.primary} ${btn.small} w-full`}>I sent it</button>
                    </form>
                    <form action={cannotMessageAction}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="returnTo" value={here} /><input type="hidden" name="reason" value="Volleybox does not allow messaging this athlete." /><button className={`${btn.secondary} ${btn.small} w-full`}>Can&apos;t message</button></form>
                  </>
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
