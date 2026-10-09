import { Flash } from "@/components/flash";
import { fmtDate, PageHeader, StatusBadge, Table } from "@/components/ui";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LogsPage({ searchParams }: { searchParams: Promise<{ level?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const db = getDb();
  const levels = sp.level === "error" ? ["error"] : sp.level === "warn" ? ["warn", "error"] : ["debug", "info", "warn", "error"];
  const logs = await db.query<any>("select * from event_log where level = any($1::text[]) order by created_at desc limit 150", [levels]);
  const jobs = await db.query<any>("select * from jobs order by created_at desc limit 40");
  return (
    <>
      <PageHeader title="Logs & jobs" description="Persistent queue state and event log. Failed jobs retry with exponential backoff and are marked dead after the maximum attempts." />
      <Flash ok={sp.ok} error={sp.error} />
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Jobs</h2>
      <Table head={["Type", "Status", "Attempts", "Run at", "Finished", "Error"]} empty={jobs.length ? undefined : "No jobs yet."}>
        {jobs.map((j) => (
          <tr key={j.id}>
            <td className="px-3 py-2 font-mono text-xs">{j.type}</td><td className="px-3 py-2"><StatusBadge status={j.status} /></td>
            <td className="px-3 py-2">{j.attempts}/{j.max_attempts}</td><td className="px-3 py-2">{fmtDate(j.run_at)}</td><td className="px-3 py-2">{fmtDate(j.finished_at)}</td>
            <td className="px-3 py-2 text-xs text-red-700">{j.last_error}</td>
          </tr>
        ))}
      </Table>
      <div className="mb-2 mt-8 flex items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Event log</h2>
        <a className="text-xs underline" href="/logs">all</a><a className="text-xs underline" href="/logs?level=warn">warnings+</a><a className="text-xs underline" href="/logs?level=error">errors</a>
      </div>
      <Table head={["Time", "Level", "Source", "Message"]} empty={logs.length ? undefined : "No events."}>
        {logs.map((l) => (
          <tr key={l.id}>
            <td className="whitespace-nowrap px-3 py-2">{fmtDate(l.created_at)}</td><td className="px-3 py-2"><StatusBadge status={l.level} /></td>
            <td className="px-3 py-2">{l.source}</td>
            <td className="px-3 py-2">{l.athlete_id ? <a className="underline" href={`/athletes/${l.athlete_id}`}>{l.message}</a> : l.message}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
