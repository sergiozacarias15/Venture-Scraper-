export type VolleyboxMode = {
  mode: "mock" | "live";
  /** Why live mode is not active (shown in the dashboard). */
  reason?: string;
};

/**
 * Live mode requires explicit opt-in AND credentials for an authorized Volleybox
 * integration. Anything else falls back to the mock adapters, which never contact Volleybox.
 */
export function getVolleyboxMode(env: Record<string, string | undefined> = process.env): VolleyboxMode {
  if (env.VOLLEYBOX_MODE !== "live") {
    return { mode: "mock", reason: "VOLLEYBOX_MODE is not set to \"live\"." };
  }
  if (!env.VOLLEYBOX_API_BASE_URL || !env.VOLLEYBOX_API_KEY) {
    return { mode: "mock", reason: "VOLLEYBOX_API_BASE_URL / VOLLEYBOX_API_KEY are not configured (no authorized integration)." };
  }
  return { mode: "live" };
}
