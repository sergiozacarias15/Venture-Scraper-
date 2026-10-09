import { markAlertsReadAction, runJobsNowAction } from "./actions";
import { Flash } from "@/components/flash";
import { ModeBanner } from "@/components/mode-banner";
import { Badge, btn, Card, fmtDate, PageHeader, Stat, StatusBadge, Table } from "@/components/ui";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const db = getDb();
  const settings = await getSettings(db);
  const [counts] = await db.query<Record<string, number>>(`
    select
      (select count(*) from athletes)::int as discovered,
      (select count(*) from messages where direction='out' and status in ('pending_approval','approved','sending'))::int as queued,
      (select count(*) from messages where direction='out' and status='pending_approval')::int as awaiting,
      (select count(*) from athletes where first_contacted_at is not null)::int as contacted,
      (select count(*) from messages where direction='in')::int as replies,
      (select count(*) from athletes where status='interested')::int as interested,
      (select count(*) from suppressions)::int as suppressed,
      (select count(*) from messages where direction='out' and status='sent' and sent_at > now() - interval '24 hours')::int as sent24,
      (select count(*) from conversations where outcome='no_response')::int as no_response,
      (select count(*) from leads where status in ('moved_whatsapp','moved_instagram'))::int as moved`);
  const alerts = await db.query<{ id: string; kind: string; title: string; body: string | null; athlete_id: string | null; created_at: Date }>(
    "select id, kind, title, body, athlete_id, created_at from alerts where read_at is null order by created_at desc limit 10");
  const funnel = await db.query<{ status: string; n: number }>("select status, count(*)::int n from athletes group by status order by n desc");
  const jobs = await db.query<{ id: string; type: string; status: string; attempts: number; last_error: string | null; created_at: Date }>(
    "select id, type, status, attempts, last_error, created_at from jobs order by created_at desc limit 6");

  return (
    <>
      <PageHeader title="Dashboard" description="Discovery, outreach, replies and interested leads at a glance.">
        <form action={runJobsNowAction}>
          <button className={btn.secondary}>Run background jobs now</button>
        </form>
      </PageHeader>
      <Flash ok={ok} error={error} />
      <ModeBanner settings={settings} />
      {!settings.outreach_enabled && (
        <div className="mb-4 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm">
          Automated sending is <strong>off</strong>. Drafts are still prepared so you can review them; turn it on in <a className="underline" href="/settings">Settings</a>.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Discovered" value={counts.discovered} href="/athletes" />
        <Stat label="In queue" value={counts.queued} hint={`${counts.awaiting} awaiting approval`} href="/outreach" />
        <Stat label="Contacted" value={counts.contacted} hint={`${counts.sent24}/${settings.daily_cap} in last 24h`} href="/athletes?status=contacted" />
        <Stat label="Replies" value={counts.replies} href="/inbox" />
        <Stat label="Interested" value={counts.interested} hint={`${counts.moved} moved off-platform`} href="/leads" />
        <Stat label="Suppressed" value={counts.suppressed} hint={`${counts.no_response} no response`} href="/suppressions" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Alerts" className="lg:col-span-2">
          {alerts.length === 0 ? (
            <p className="text-sm text-slate-500">No unread alerts.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="text-sm">
                    <div className="flex items-center gap-2">
                      <Badge tone={a.kind === "interested" ? "green" : a.kind === "question" ? "violet" : "red"}>{a.kind.replace("_", " ")}</Badge>
                      {a.athlete_id ? <a className="font-medium underline" href={`/athletes/${a.athlete_id}`}>{a.title}</a> : <span className="font-medium">{a.title}</span>}
                    </div>
                    {a.body && <p className="mt-1 text-slate-600">{a.body}</p>}
                    <p className="mt-0.5 text-xs text-slate-400">{fmtDate(a.created_at)}</p>
                  </div>
                  <form action={markAlertsReadAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className={`${btn.secondary} ${btn.small}`}>Dismiss</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          {alerts.length > 1 && (
            <form action={markAlertsReadAction} className="mt-3"><button className="text-xs text-slate-500 underline">Dismiss all</button></form>
          )}
        </Card>
        <Card title="Pipeline by status">
          <ul className="space-y-1.5 text-sm">
            {funnel.length === 0 && <li className="text-slate-500">No athletes yet. Run discovery.</li>}
            {funnel.map((f) => (
              <li key={f.status} className="flex items-center justify-between">
                <a href={`/athletes?status=${f.status}`}><StatusBadge status={f.status} /></a>
                <span className="tabular-nums">{f.n}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent background jobs</h2>
      <Table head={["Job", "Status", "Attempts", "Created", "Last error"]} empty={jobs.length ? undefined : "No jobs have run yet."}>
        {jobs.map((j) => (
          <tr key={j.id}>
            <td className="px-3 py-2 font-mono text-xs">{j.type}</td>
            <td className="px-3 py-2"><StatusBadge status={j.status} /></td>
            <td className="px-3 py-2">{j.attempts}</td>
            <td className="px-3 py-2">{fmtDate(j.created_at)}</td>
            <td className="px-3 py-2 text-xs text-red-700">{j.last_error}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
