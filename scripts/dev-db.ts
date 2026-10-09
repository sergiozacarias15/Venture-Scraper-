import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Docker-free local database for development: an embedded Postgres (PGlite) that applies
 * supabase/migrations and listens on a TCP port. Data lives in ./.pgdata.
 * Connect with SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres
 */
async function main() {
  const db = await PGlite.create(process.env.DEV_DB_DIR ?? "./.pgdata");
  await db.exec("create table if not exists app_migrations (name text primary key)");
  const dir = path.resolve(__dirname, "../supabase/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const done = await db.query("select 1 from app_migrations where name = $1", [f]);
    if (done.rows.length) continue;
    console.log(`applying ${f}`);
    await db.exec(readFileSync(path.join(dir, f), "utf8"));
    await db.query("insert into app_migrations (name) values ($1)", [f]);
  }
  const port = Number(process.env.DEV_DB_PORT ?? 5433);
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });
  await server.start();
  console.log(`dev database ready on postgresql://postgres:postgres@127.0.0.1:${port}/postgres`);
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, async () => { await server.stop(); await db.close(); process.exit(0); });
  }
}
main();
