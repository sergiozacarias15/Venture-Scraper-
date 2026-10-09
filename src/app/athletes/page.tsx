import { Flash } from "@/components/flash";
import { Badge, btn, input, PageHeader, StatusBadge, Table } from "@/components/ui";
import { COUNTRIES } from "@/lib/countries";
import { getDb } from "@/lib/db";
import { isPotentialMinor } from "@/modules/messaging/safeguards";

export const dynamic = "force-dynamic";
const PAGE = 100;
const STATUSES = ["discovered", "queued", "contacted", "replied", "interested", "not_interested", "suppressed", "unreachable", "excluded"];

type Sp = { q?: string; status?: string; year?: string; country?: string; gender?: string; page?: string; ok?: string; error?: string };

export default async function AthletesPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace("?", `$${params.length}`)); };
  if (sp.q) add("(full_name ilike ? or club ilike ?)", `%${sp.q}%`);
  if (sp.status) add("status = ?", sp.status);
  if (sp.year) add("birth_year = ?", Number(sp.year));
  if (sp.country) add("nationality = ?", sp.country);
  if (sp.gender) add("gender = ?", sp.gender);
  const page = Math.max(1, Number(sp.page ?? 1));
  const clause = where.length ? `where ${where.join(" and ")}` : "";
  const db = getDb();
  const [{ n }] = await db.query<{ n: number }>(`select count(*)::int n from athletes ${clause}`, params);
  const rows = await db.query<{
    id: string; full_name: string; profile_url: string; birth_year: number | null; birth_date: string | null; nationality: string | null;
    gender: string | null; position: string | null; club: string | null; status: string; first_contacted_at: Date | null;
  }>(`select * from athletes ${clause} order by discovered_at desc, full_name limit ${PAGE} offset ${(page - 1) * PAGE}`, params);
  const qs = (p: number) => new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && !["page", "ok", "error"].includes(k))), page: String(p) }).toString();

  return (
    <>
      <PageHeader title="Athletes" description={`${n} athlete${n === 1 ? "" : "s"} in the database.`} />
      <Flash ok={sp.ok} error={sp.error} />
      <form className="mb-4 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-6">
        <input name="q" defaultValue={sp.q} placeholder="Search name or club" className={`${input} md:col-span-2`} />
        <select name="status" defaultValue={sp.status ?? ""} className={input}><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select>
        <select name="year" defaultValue={sp.year ?? ""} className={input}><option value="">Any birth year</option>{[2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012].map((y) => <option key={y}>{y}</option>)}</select>
        <select name="country" defaultValue={sp.country ?? ""} className={input}><option value="">Any country</option>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
        <div className="flex gap-2">
          <select name="gender" defaultValue={sp.gender ?? ""} className={input}><option value="">Any gender</option><option value="female">Female</option><option value="male">Male</option></select>
          <button className={btn.primary}>Filter</button>
        </div>
      </form>
      <Table head={["Athlete", "Born", "Country", "Position", "Club", "Status", "Volleybox"]} empty={rows.length ? undefined : "No athletes match."}>
        {rows.map((a) => (
          <tr key={a.id} className="hover:bg-slate-50">
            <td className="px-3 py-2"><a className="font-medium underline" href={`/athletes/${a.id}`}>{a.full_name}</a> {isPotentialMinor(a) && <Badge tone="amber">minor?</Badge>}</td>
            <td className="px-3 py-2">{a.birth_year ?? "-"}</td>
            <td className="px-3 py-2">{a.nationality ?? "-"}</td>
            <td className="px-3 py-2">{a.position ?? "-"}</td>
            <td className="px-3 py-2">{a.club ?? "-"}</td>
            <td className="px-3 py-2"><StatusBadge status={a.status} /></td>
            <td className="px-3 py-2"><a className="text-sky-700 underline" href={a.profile_url} target="_blank" rel="noreferrer">Open profile</a></td>
          </tr>
        ))}
      </Table>
      {n > PAGE && (
        <div className="mt-3 flex items-center gap-3 text-sm">
          {page > 1 && <a className="underline" href={`?${qs(page - 1)}`}>Previous</a>}
          <span>Page {page} of {Math.ceil(n / PAGE)}</span>
          {page * PAGE < n && <a className="underline" href={`?${qs(page + 1)}`}>Next</a>}
        </div>
      )}
    </>
  );
}
