/**
 * assisted (default): no automated access to Volleybox exists, so athletes are imported from data the
 *   operator is entitled to use, and the operator sends each message personally on Volleybox and
 *   confirms it here. Everything stored is real.
 * demo: synthetic athletes and a fake "sender" for trying the app. Never contacts anyone.
 *
 * There is intentionally no "live" mode: Volleybox publishes no API or partner program (see README).
 */
export type VolleyboxMode = { mode: "assisted" | "demo" };

export function getVolleyboxMode(env: Record<string, string | undefined> = process.env): VolleyboxMode {
  return { mode: env.VOLLEYBOX_MODE === "demo" ? "demo" : "assisted" };
}
