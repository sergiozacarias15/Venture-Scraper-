import { getVolleyboxMode } from "@/lib/env";
import type { DiscoveryAdapter } from "../types";
import { MockDiscoveryAdapter } from "./mock";

/** null in assisted mode: there is no authorized automated source of Volleybox profiles. */
export function getDiscoveryAdapter(): DiscoveryAdapter | null {
  return getVolleyboxMode().mode === "demo" ? new MockDiscoveryAdapter() : null;
}
