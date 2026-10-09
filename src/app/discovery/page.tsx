import { importCsvAction, runDiscoveryNow, saveDiscoverySettings } from "../actions";
import { Flash } from "@/components/flash";
import { ModeBanner } from "@/components/mode-banner";
import { btn, Card, CheckGroup, Field, fmtDate, input, PageHeader, StatusBadge, Table } from "@/components/ui";
import { COUNTRIES } from "@/lib/countries";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { POSITIONS } from "@/modules/discovery/normalize";

export const dynamic = "force-dynamic";
const YEARS = [2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012];

export default async function DiscoveryPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const db = getDb();
  const s = await getSettings(db);
  const runs = await db.query<{
    id: string; status: string; adapter: string; found: number; inserted: number; duplicates: number;
    skipped_suppressed: number; skipped_criteria: number; error: string | null; started_at: Date;
  }>("select * from discovery_runs order by started_at desc limit 10");

  return (
    <>
      <PageHeader title="Discovery" description="Choose who to look for. The discovery job searches the authorized data source on a schedule, saves new athletes and skips duplicates, previously contacted and suppressed athletes." />
      <Flash ok={ok} error={error} />
      <ModeBanner settings={s} returnTo="/discovery" />

      <form action={saveDiscoverySettings} className="space-y-5">
        <Card title="Who to find">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Birth years"><CheckGroup name="years" options={YEARS.map((y) => ({ value: y, label: String(y) }))} selected={s.criteria_birth_years} /></Field>
            <Field label="Gender"><CheckGroup name="genders" options={[{ value: "female", label: "Female" }, { value: "male", label: "Male" }]} selected={s.criteria_genders} /></Field>
            <div className="md:col-span-2">
              <Field label="Nationality" hint="Athletes with an unknown nationality or birth year are never selected.">
                <CheckGroup name="countries" options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))} selected={s.criteria_countries} />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Positions" hint="Leave all unchecked to include every position.">
                <CheckGroup name="positions" options={POSITIONS.map((p) => ({ value: p, label: p }))} selected={s.criteria_positions} />
              </Field>
            </div>
          </div>
        </Card>
        <Card title="Schedule">
          <div className="grid items-end gap-4 md:grid-cols-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={s.discovery_enabled} /> Run discovery automatically</label>
            <Field label="Every (minutes)"><input name="interval" type="number" min={5} defaultValue={s.discovery_interval_minutes} className={input} /></Field>
            <Field label="Max athletes per run"><input name="max" type="number" min={1} defaultValue={s.discovery_max_per_run} className={input} /></Field>
            <button className={btn.primary}>Save criteria</button>
          </div>
        </Card>
      </form>

      <div className="mt-4 flex gap-2">
        <form action={runDiscoveryNow}><button className={btn.secondary}>Run discovery now (saved criteria)</button></form>
      </div>

      <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent runs</h2>
      <Table head={["Started", "Source", "Status", "Found", "New", "Duplicates", "Suppressed", "Outside criteria"]} empty={runs.length ? undefined : "No discovery runs yet."}>
        {runs.map((r) => (
          <tr key={r.id}>
            <td className="px-3 py-2">{fmtDate(r.started_at)}</td>
            <td className="px-3 py-2 font-mono text-xs">{r.adapter}</td>
            <td className="px-3 py-2"><StatusBadge status={r.status === "succeeded" ? "succeeded" : r.status === "failed" ? "failed" : "running"} />{r.error && <div className="text-xs text-red-700">{r.error}</div>}</td>
            <td className="px-3 py-2">{r.found}</td><td className="px-3 py-2 font-medium">{r.inserted}</td><td className="px-3 py-2">{r.duplicates}</td>
            <td className="px-3 py-2">{r.skipped_suppressed}</td><td className="px-3 py-2">{r.skipped_criteria}</td>
          </tr>
        ))}
      </Table>

      <Card title="Import from CSV (authorized export)" className="mt-8">
        <form action={importCsvAction} className="space-y-3">
          <p className="text-sm text-slate-600">Columns: <code>name, volleybox_url, birth_year (or birth_date), gender, nationality, position, club, instagram, language</code>. Profile URLs must be on volleybox.net.</p>
          <input type="file" name="file" accept=".csv,text/csv" className="text-sm" />
          <textarea name="csv" rows={3} placeholder="...or paste CSV text here" className={input} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="applyCriteria" defaultChecked /> Only import athletes matching the criteria above</label>
          <button className={btn.primary}>Import</button>
        </form>
      </Card>
    </>
  );
}
