import { importPassAction } from "../../actions";
import { Flash } from "@/components/flash";
import { btn, Card, Field, input, Notice, PageHeader } from "@/components/ui";
import { countryByCode } from "@/lib/countries";
import { getDb } from "@/lib/db";
import { POSITIONS } from "@/modules/discovery/normalize";
import { syncPasses } from "@/modules/discovery/passes";
import { describePass, RANKING_URL } from "@/modules/volleybox/interfaces";

export const dynamic = "force-dynamic";

export default async function ImportPassPage({ searchParams }: { searchParams: Promise<{ pass?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const passes = await syncPasses(getDb());
  const pass = passes.find((p) => p.id === sp.pass);

  if (!pass) {
    return (
      <>
        <PageHeader title="Ranking pass" />
        <Flash ok={sp.ok} error={sp.error} />
        <Notice tone="amber">That pass is not part of your current criteria. <a className="underline" href="/discovery">Back to Discovery</a></Notice>
      </>
    );
  }
  const label = describePass({ birthYear: pass.birth_year, country: pass.country, gender: pass.gender });
  const countryName = countryByCode(pass.country)?.name ?? pass.country;
  const section = pass.gender === "female" ? "Women" : "Men";

  return (
    <>
      <PageHeader title={`Ranking pass: ${label}`} description="Review the filtered players on Volleybox yourself, then paste the ones you want to contact." />
      <Flash ok={sp.ok} error={sp.error} />
      <Card title="1. Set these filters on Volleybox" className="mb-4">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Open the <a className="underline" href={RANKING_URL} target="_blank" rel="noreferrer">player ranking page</a> in the <strong>{section}</strong> section, signed in to your own account.</li>
          <li>Birthdate: <strong>{pass.birth_year}</strong> &nbsp;|&nbsp; Country: <strong>{countryName}</strong></li>
          <li>Optionally narrow by position, tournament or height.</li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">The app does not guess Volleybox&apos;s filter URLs, so the filters are set by hand on the page.</p>
      </Card>
      <Card title="2. Paste the players you want">
        <form action={importPassAction} className="space-y-3">
          <input type="hidden" name="passId" value={pass.id} />
          <p className="text-sm text-slate-600">One player per line: the profile link and the name, separated by a comma, tab or <code>|</code>. A position may follow. Example:</p>
          <pre className="rounded-lg bg-slate-100 p-2 text-xs">https://volleybox.net/example-player-p123 | Example Player | Outside Hitter</pre>
          <textarea name="text" rows={10} required placeholder="Paste player lines here" className={`${input} font-mono text-xs`} />
          <Field label="Position filter you used (optional)" hint="Applied to lines that do not name a position themselves.">
            <select name="position" className={`${input} max-w-xs`}>
              <option value="">Any / not filtered</option>
              {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <p className="text-xs text-slate-500">
            Birth year ({pass.birth_year}), country ({countryName}) and section ({section}) are recorded from the filters you applied and marked as operator-asserted.
            Duplicates, suppressed profiles and anyone outside your criteria are skipped. Anyone who may be under 18 will still need your explicit approval before any message.
          </p>
          <div className="flex gap-2">
            <button className={btn.primary}>Import players</button>
            <a className={btn.secondary} href="/discovery">Back to passes</a>
          </div>
        </form>
      </Card>
    </>
  );
}
