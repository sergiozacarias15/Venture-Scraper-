import { getVolleyboxMode } from "@/lib/env";
import { AssistedMessagingAdapter } from "./assisted";
import { MockMessagingAdapter } from "./mock";
import type { MessagingAdapter } from "./types";

export function getMessagingAdapter(): MessagingAdapter {
  return getVolleyboxMode().mode === "demo" ? new MockMessagingAdapter() : new AssistedMessagingAdapter();
}
