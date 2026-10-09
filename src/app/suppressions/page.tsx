import { addSuppressionAction, liftSuppressionAction } from "../actions";
import { Flash } from "@/components/flash";
import { btn, Card, fmtDate, input, PageHeader, Table } from "@/components/ui";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SuppressionsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const rows = await getDb().query<any>(
    `select s.*, a.full_name from suppressions s left join athletes a on a.id = s.athlete_id order by s.created_at desc limit 500`);
  return (
    <>
      <PageHeader title="Suppression list" description="Athletes who declined, opted out, or that you excluded. They are never messaged again and are skipped on re-import." />
      <Flash ok={sp.ok} error={sp.error} />
      <Card title="Add a profile" className="mb-4">
        <form action={addSuppressionAction} className="flex flex-wrap gap-2">
          <input name="url" required placeholder="https://volleybox.net/..." className={`${input} max-w-md`} />
          <input name="note" placeholder="Note (optional)" className={`${input} max-w-xs`} />
          <button className={btn.primary}>Add</button>
        </form>
      </Card>
      <Table head={["Athlete / profile", "Reason", "Source", "Added", ""]} empty={rows.length ? undefined : "The suppression list is empty."}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="px-3 py-2">{r.athlete_id ? <a className="font-medium underline" href={`/athletes/${r.athlete_id}`}>{r.full_name}</a> : <span className="font-mono text-xs">{r.profile_url}</span>}</td>
            <td className="px-3 py-2">{r.reason.replace("_", " ")}{r.note && <div className="max-w-sm text-xs text-slate-500">{r.note}</div>}</td>
            <td className="px-3 py-2">{r.source}</td>
            <td className="px-3 py-2">{fmtDate(r.created_at)}</td>
            <td className="px-3 py-2">
              {r.athlete_id && r.reason !== "opt_out" && (
                <form action={liftSuppressionAction}><input type="hidden" name="athleteId" value={r.athlete_id} /><button className={`${btn.secondary} ${btn.small}`}>Lift</button></form>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
