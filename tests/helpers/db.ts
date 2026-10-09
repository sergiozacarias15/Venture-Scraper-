import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Db } from "@/lib/db";

class PgliteDb implements Db {
  constructor(private pg: PGlite | any) {}
  async query<T>(sql: string, params: unknown[] = []) {
    return (await this.pg.query(sql, params)).rows as T[];
  }
  async tx<R>(fn: (db: Db) => Promise<R>): Promise<R> {
    if (this.pg.transaction) {
      return this.pg.transaction(async (t: any) => fn(new PgliteDb(t)));
    }
    return fn(this);
  }
}

let shared: PGlite | undefined;

/** One in-process Postgres per test file; tables are emptied between tests. */
export async function createTestDb(): Promise<Db> {
  if (!shared) {
    shared = new PGlite();
    const dir = path.resolve(__dirname, "../../supabase/migrations");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      await shared.exec(readFileSync(path.join(dir, f), "utf8"));
    }
  }
  await shared.exec(`truncate settings, discovery_runs, discovery_passes, athletes, suppressions, conversations, messages, leads, alerts, jobs, event_log restart identity cascade; insert into settings (id) values (1);`);
  return new PgliteDb(shared);
}

export async function seedAthlete(db: Db, over: Partial<{
  url: string; name: string; birthYear: number | null; gender: string; nationality: string; position: string;
  club: string; status: string; language: string | null;
}> = {}) {
  const n = Math.random().toString(36).slice(2, 10);
  const name = over.name ?? "Giulia Rossi";
  const [row] = await db.query<{ id: string }>(
    `insert into athletes (profile_url, full_name, first_name, birth_year, gender, nationality, position, club, status, preferred_language, source)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'test') returning id`,
    [over.url ?? `https://volleybox.net/player/${n}`, name, name.split(" ")[0],
      over.birthYear === undefined ? 2007 : over.birthYear, over.gender ?? "female", over.nationality ?? "IT",
      over.position ?? "Setter", over.club ?? null, over.status ?? "discovered", over.language ?? null],
  );
  return row.id;
}
