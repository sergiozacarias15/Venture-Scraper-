import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

/** Applies supabase/migrations/*.sql to SUPABASE_DB_URL (alternative to `supabase db push`). */
async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL is not set");
  const client = new Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
  await client.connect();
  await client.query("create table if not exists public.app_migrations (name text primary key, applied_at timestamptz not null default now())");
  const dir = path.resolve(__dirname, "../supabase/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const done = await client.query("select 1 from public.app_migrations where name = $1", [f]);
    if (done.rowCount) continue;
    console.log(`applying ${f}`);
    await client.query("begin");
    try {
      await client.query(readFileSync(path.join(dir, f), "utf8"));
      await client.query("insert into public.app_migrations (name) values ($1)", [f]);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  }
  await client.end();
  console.log("migrations up to date");
}
main().catch((e) => { console.error(e); process.exit(1); });
