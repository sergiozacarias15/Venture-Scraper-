import { getDb } from "../src/lib/db";
import { defaultDeps } from "../src/modules/jobs/handlers";
import { tick } from "../src/modules/jobs/runner";

/** Long-running worker for self-hosting: same tick as /api/cron/tick, every 30 seconds. */
const intervalMs = Number(process.env.WORKER_INTERVAL_SECONDS ?? 30) * 1000;
let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { stopping = true; });

async function main() {
  const db = getDb();
  console.log(`worker started (interval ${intervalMs / 1000}s)`);
  while (!stopping) {
    try {
      const result = await tick(db, defaultDeps());
      if (result.ran) console.log(new Date().toISOString(), JSON.stringify(result));
    } catch (err) {
      console.error("tick failed", err);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  process.exit(0);
}
main();
