import type { Db } from "@/lib/db";
import { logEvent } from "@/lib/logger";
import { normalizePosition } from "./normalize";
import { criteriaFromSettings, ingestAthletes, type IngestStats } from "./service";
import { describePass, parseRankingLines, rankingPasses } from "@/modules/volleybox/interfaces";

export type PassRow = {
  id: string; birth_year: number; country: string; gender: "female" | "male"; status: "pending" | "done";
  imported: number; duplicates: number; last_import_at: Date | null; completed_at: Date | null;
};

/** Creates the passes implied by the current criteria (idempotent) and returns exactly those. */
export async function syncPasses(db: Db): Promise<PassRow[]> {
  const criteria = await criteriaFromSettings(db);
  const wanted = rankingPasses(criteria);
  for (const p of wanted) {
    await db.query(
      "insert into discovery_passes (birth_year, country, gender) values ($1,$2,$3) on conflict do nothing",
      [p.birthYear, p.country, p.gender],
    );
  }
  if (!wanted.length) return [];
  return db.query<PassRow>(
    `select * from discovery_passes
     where birth_year = any($1::int[]) and country = any($2::text[]) and gender = any($3::text[])
     order by gender desc, country, birth_year`,
    [criteria.birthYears, criteria.countries, criteria.genders],
  );
}

export async function setPassStatus(db: Db, id: string, status: "pending" | "done") {
  await db.query(
    "update discovery_passes set status = $2, completed_at = case when $2 = 'done' then now() else null end where id = $1",
    [id, status],
  );
}

export type PassImportResult = IngestStats & { errors: string[] };

/**
 * Imports athletes the operator reviewed on a filtered Volleybox ranking page. The birth year, country and
 * gender come from the filters the operator applied (the pass); they are recorded as operator-asserted.
 * The usual dedupe, suppression and criteria checks still apply.
 */
export async function importRankingPass(
  db: Db, passId: string, input: { text: string; position?: string | null },
): Promise<PassImportResult> {
  const [pass] = await db.query<PassRow>("select * from discovery_passes where id = $1", [passId]);
  if (!pass) throw new Error("Discovery pass not found.");
  const filterPosition = normalizePosition(input.position ?? "");
  const { rows, errors } = parseRankingLines(input.text, (t) => normalizePosition(t) !== null);
  if (!rows.length) throw new Error(errors[0] ?? "Paste at least one athlete (name and profile link).");
  const criteria = await criteriaFromSettings(db);
  const stats = await ingestAthletes(
    db,
    rows.map((r) => ({
      profileUrl: r.profileUrl,
      fullName: r.name,
      birthYear: pass.birth_year,
      gender: pass.gender,
      nationality: pass.country,
      position: r.position ?? filterPosition,
      raw: { source: "ranking_filter", pass: describePass({ birthYear: pass.birth_year, country: pass.country, gender: pass.gender }), operatorAsserted: ["birth_year", "nationality", "gender"] },
    })),
    { source: "ranking_pass", criteria },
  );
  await db.query(
    "update discovery_passes set imported = imported + $2, duplicates = duplicates + $3, last_import_at = now() where id = $1",
    [passId, stats.inserted, stats.duplicates],
  );
  await logEvent(db, "info", "discovery", `Ranking pass import: ${stats.inserted} new, ${stats.duplicates} duplicates`, { meta: { passId, ...stats } });
  return { ...stats, errors };
}
