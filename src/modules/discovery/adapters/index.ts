import { getVolleyboxMode } from "@/lib/env";
import type { DiscoveryAdapter } from "../types";
import { HttpDiscoveryAdapter } from "./http";
import { MockDiscoveryAdapter } from "./mock";

export function getDiscoveryAdapter(): DiscoveryAdapter {
  return getVolleyboxMode().mode === "live" ? new HttpDiscoveryAdapter() : new MockDiscoveryAdapter();
}
