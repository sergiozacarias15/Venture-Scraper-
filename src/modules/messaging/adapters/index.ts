import { getVolleyboxMode } from "@/lib/env";
import { HttpMessagingAdapter } from "./http";
import { MockMessagingAdapter } from "./mock";
import type { MessagingAdapter } from "./types";

export function getMessagingAdapter(): MessagingAdapter {
  return getVolleyboxMode().mode === "live" ? new HttpMessagingAdapter() : new MockMessagingAdapter();
}
