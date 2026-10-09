import { addMinutes } from "@/lib/time";
import { zonedParts } from "@/lib/time";

export type GateSettings = {
  outreach_enabled: boolean;
  sending_paused_until: Date | null;
  timezone: string;
  window_start_hour: number;
  window_end_hour: number;
  send_days: number[];
  daily_cap: number;
  min_interval_seconds: number;
};

export type GateDecision =
  | { allowed: true }
  | { allowed: false; reason: string; retryAt?: Date };

/** Pure policy check run before every single send. */
export function evaluateSendGate(input: {
  now: Date;
  settings: GateSettings;
  sentLast24h: number;
  lastSentAt: Date | null;
}): GateDecision {
  const { now, settings: s } = input;
  if (!s.outreach_enabled) return { allowed: false, reason: "Outreach is switched off." };
  if (s.sending_paused_until && s.sending_paused_until > now) {
    return { allowed: false, reason: "Sending is paused.", retryAt: s.sending_paused_until };
  }
  const local = zonedParts(now, s.timezone);
  if (!s.send_days.includes(local.weekday)) return { allowed: false, reason: "Not a configured sending day." };
  if (local.hour < s.window_start_hour || local.hour >= s.window_end_hour) {
    return { allowed: false, reason: "Outside the configured sending window." };
  }
  if (input.sentLast24h >= s.daily_cap) {
    return { allowed: false, reason: `Daily cap of ${s.daily_cap} reached.` };
  }
  if (input.lastSentAt) {
    const next = new Date(input.lastSentAt.getTime() + s.min_interval_seconds * 1000);
    if (next > now) return { allowed: false, reason: "Minimum interval between messages not elapsed.", retryAt: next };
  }
  return { allowed: true };
}

/** Exponential backoff for failed attempts: 1, 5, 25 minutes... */
export function retryDelayMinutes(attempt: number) {
  return Math.min(5 ** Math.max(0, attempt - 1), 24 * 60);
}

export function nextAttemptAt(now: Date, attempt: number) {
  return addMinutes(now, retryDelayMinutes(attempt));
}
