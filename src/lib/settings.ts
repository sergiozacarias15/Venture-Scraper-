import type { Db } from "./db";

export type Settings = {
  discovery_enabled: boolean;
  discovery_interval_minutes: number;
  discovery_max_per_run: number;
  criteria_birth_years: number[];
  criteria_genders: string[];
  criteria_countries: string[];
  criteria_positions: string[];
  outreach_enabled: boolean;
  auto_approve_adults: boolean;
  plan_backlog_cap: number;
  daily_cap: number;
  min_interval_seconds: number;
  window_start_hour: number;
  window_end_hour: number;
  send_days: number[];
  timezone: string;
  sender_name: string;
  sender_org: string;
  followups_enabled: boolean;
  followup_delay_days: number;
  max_followups: number;
  no_response_after_days: number;
  min_contact_age: number;
  sending_paused_until: Date | null;
  sending_paused_reason: string | null;
  replies_cursor: string | null;
};

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.query<Settings>("select * from settings where id = 1");
  return rows[0];
}

export async function updateSettings(db: Db, patch: Partial<Settings>) {
  const keys = Object.keys(patch) as (keyof Settings)[];
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  await db.query(`update settings set ${sets}, updated_at = now() where id = 1`, keys.map((k) => patch[k]));
}
