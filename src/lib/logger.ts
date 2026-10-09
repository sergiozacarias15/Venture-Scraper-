import type { Db } from "./db";

export type LogLevel = "debug" | "info" | "warn" | "error";

export async function logEvent(
  db: Db,
  level: LogLevel,
  source: string,
  message: string,
  extra: { athleteId?: string | null; meta?: Record<string, unknown> } = {},
) {
  if (process.env.NODE_ENV !== "test") {
    const line = `[${level}] ${source}: ${message}`;
    if (level === "error") console.error(line, extra.meta ?? "");
    else console.log(line);
  }
  try {
    await db.query(
      "insert into event_log (level, source, message, athlete_id, meta) values ($1,$2,$3,$4,$5::jsonb)",
      [level, source, message, extra.athleteId ?? null, extra.meta ? JSON.stringify(extra.meta) : null],
    );
  } catch (err) {
    console.error("failed to persist log event", err);
  }
}

export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
