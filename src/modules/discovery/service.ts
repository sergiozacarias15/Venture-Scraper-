import type { Db } from "@/lib/db";
import { errMessage, logEvent } from "@/lib/logger";
import { getSettings } from "@/lib/settings";
import { matchesCriteria } from "./criteria";
import { normalizeAthlete, splitName } from "./normalize";
import type { DiscoveredAthlete, DiscoveryAdapter, DiscoveryCriteria } from "./types";

export type IngestStats = {
  found: number;
  inserted: number;
  duplicates: number;
  skippedSuppressed: number;
  skippedCriteria: number;
  invalid: number;
};

const emptyStats = (): IngestStats => ({
  found: 0, inserted: 0, duplicates: 0, skippedSuppressed: 0, skippedCriteria: 0, invalid: 0,
});

/**
 * Saves athletes while guaranteeing: profile URL / Volleybox id dedupe, suppressed profiles are
 * never re-added, and existing athletes keep their outreach status (re-discovery only refreshes data).
 */
export async function ingestAthletes(
  db: Db,
  athletes: DiscoveredAthlete[],
  opts: { source: string; runId?: string | null; criteria?: DiscoveryCriteria },
): Promise<IngestStats> {
  const stats = emptyStats();
  for (const raw of athletes) {
    stats.found++;
    const a = normalizeAthlete(raw);
    if (!a) {
      stats.invalid++;
      continue;
    }
    if (opts.criteria && !matchesCriteria(a, opts.criteria)) {
      stats.skippedCriteria++;
      continue;
    }
    const suppressed = await db.query("select 1 from suppressions where profile_url = $1", [a.profileUrl]);
    if (suppressed.length) {
      stats.skippedSuppressed++;
      continue;
    }
    const existing = await db.query<{ id: string }>(
      "select id from athletes where profile_url = $1 or ($2::text is not null and volleybox_id = $2) limit 1",
      [a.profileUrl, a.volleyboxId ?? null],
    );
    if (existing.length) {
      stats.duplicates++;
      await db.query(
        `update athletes set
           club = coalesce($2, club), club_country = coalesce($3, club_country),
           height_cm = coalesce($4, height_cm), instagram = coalesce($5, instagram),
           preferred_language = coalesce($6, preferred_language), position = coalesce($7, position),
           last_seen_at = now(), updated_at = now()
         where id = $1`,
        [existing[0].id, a.club ?? null, a.clubCountry ?? null, a.heightCm ?? null, a.instagram ?? null, a.preferredLanguage ?? null, a.position ?? null],
      );
      continue;
    }
    await db.query(
      `insert into athletes (profile_url, volleybox_id, full_name, first_name, birth_year, birth_date, gender,
         nationality, position, club, club_country, height_cm, instagram, preferred_language, source, raw, discovery_run_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17)`,
      [
        a.profileUrl, a.volleyboxId ?? null, a.fullName, splitName(a.fullName).firstName, a.birthYear ?? null,
        a.birthDate ?? null, a.gender ?? null, a.nationality, a.position ?? null, a.club ?? null, a.clubCountry ?? null,
        a.heightCm ?? null, a.instagram ?? null, a.preferredLanguage ?? null, opts.source,
        a.raw ? JSON.stringify(a.raw) : null, opts.runId ?? null,
      ],
    );
    stats.inserted++;
  }
  return stats;
}

const MAX_PAGES = 100;
const PAGE_SIZE = 50;

export async function criteriaFromSettings(db: Db): Promise<DiscoveryCriteria> {
  const s = await getSettings(db);
  return {
    birthYears: s.criteria_birth_years,
    genders: s.criteria_genders,
    countries: s.criteria_countries,
    positions: s.criteria_positions,
  };
}

export async function runDiscovery(db: Db, adapter: DiscoveryAdapter, criteriaOverride?: DiscoveryCriteria) {
  const settings = await getSettings(db);
  const criteria = criteriaOverride ?? (await criteriaFromSettings(db));
  if (!criteria.birthYears.length || !criteria.countries.length) {
    throw new Error("Discovery needs at least one birth year and one country.");
  }
  const [run] = await db.query<{ id: string }>(
    "insert into discovery_runs (adapter, criteria) values ($1, $2::jsonb) returning id",
    [adapter.id, JSON.stringify(criteria)],
  );
  const total = emptyStats();
  try {
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES && total.found < settings.discovery_max_per_run; page++) {
      const result = await adapter.search(criteria, cursor, Math.min(PAGE_SIZE, settings.discovery_max_per_run - total.found));
      const stats = await ingestAthletes(db, result.athletes, { source: adapter.id, runId: run.id, criteria });
      for (const k of Object.keys(total) as (keyof IngestStats)[]) total[k] += stats[k];
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    await db.query(
      `update discovery_runs set status='succeeded', found=$2, inserted=$3, duplicates=$4,
         skipped_suppressed=$5, skipped_criteria=$6, finished_at=now() where id=$1`,
      [run.id, total.found, total.inserted, total.duplicates, total.skippedSuppressed, total.skippedCriteria],
    );
    await logEvent(db, "info", "discovery", `Run finished via ${adapter.id}`, { meta: { runId: run.id, ...total } });
    return { runId: run.id, ...total };
  } catch (err) {
    await db.query("update discovery_runs set status='failed', error=$2, found=$3, inserted=$4, finished_at=now() where id=$1", [
      run.id, errMessage(err), total.found, total.inserted,
    ]);
    await logEvent(db, "error", "discovery", `Run failed: ${errMessage(err)}`, { meta: { runId: run.id } });
    throw err;
  }
}
