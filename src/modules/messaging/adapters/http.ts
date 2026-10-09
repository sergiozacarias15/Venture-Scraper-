import { z } from "zod";
import {
  PermanentSendError, SendBlockedError, TransientSendError,
  type InboundMessage, type MessagingAdapter, type OutboundMessage, type SendResult,
} from "./types";

const sendResponse = z.object({ id: z.union([z.string(), z.number()]), thread_id: z.union([z.string(), z.number()]) });
const inboundResponse = z.object({
  data: z.array(z.object({
    id: z.union([z.string(), z.number()]),
    thread_id: z.union([z.string(), z.number()]).nullish(),
    athlete_url: z.string().nullish(),
    athlete_id: z.union([z.string(), z.number()]).nullish(),
    body: z.string(),
    received_at: z.string(),
  })),
  next_cursor: z.string().nullish(),
});

/**
 * Adapter for an authorized Volleybox messaging integration. The request/response shapes are
 * assumptions to be aligned with your agreement. Policy responses (429, captcha, restricted
 * account) are surfaced as SendBlockedError, which pauses sending; they are never worked around.
 */
export class HttpMessagingAdapter implements MessagingAdapter {
  id = "volleybox-api";
  live = true;
  constructor(
    private baseUrl = process.env.VOLLEYBOX_API_BASE_URL!,
    private apiKey = process.env.VOLLEYBOX_API_KEY!,
    private fetchImpl: typeof fetch = fetch,
    private conversationTemplate = process.env.VOLLEYBOX_CONVERSATION_URL_TEMPLATE,
  ) {}

  private url(path: string) {
    return `${this.baseUrl.replace(/\/$/, "")}${path}`;
  }

  async send(msg: OutboundMessage): Promise<SendResult> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.url("/messages"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": msg.messageId,
        },
        body: JSON.stringify({
          recipient_url: msg.athlete.profileUrl,
          recipient_id: msg.athlete.volleyboxId,
          thread_id: msg.threadId,
          body: msg.body,
        }),
      });
    } catch (err) {
      throw new TransientSendError(`Network error: ${(err as Error).message}`);
    }
    if (res.ok) {
      const parsed = sendResponse.parse(await res.json());
      const threadId = String(parsed.thread_id);
      return { externalId: String(parsed.id), threadId, conversationUrl: this.conversationUrl(threadId, msg.athlete.profileUrl) };
    }
    const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    const detail = body.message ?? `HTTP ${res.status}`;
    if (res.status === 429) {
      const retry = Number(res.headers.get("retry-after"));
      throw new SendBlockedError("rate_limited", detail, retry > 0 ? new Date(Date.now() + retry * 1000) : undefined);
    }
    if (body.code === "captcha_required") throw new SendBlockedError("captcha", detail);
    if (res.status === 401 || res.status === 403 || body.code === "account_restricted") {
      throw new SendBlockedError("account_restricted", detail);
    }
    if (res.status >= 500) throw new TransientSendError(detail);
    throw new PermanentSendError(detail);
  }

  async fetchReplies(cursor: string | null) {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const res = await this.fetchImpl(this.url(`/messages/inbound${q}`), { headers: { Authorization: `Bearer ${this.apiKey}` } });
    if (!res.ok) throw new TransientSendError(`Inbound fetch failed: HTTP ${res.status}`);
    const parsed = inboundResponse.parse(await res.json());
    const messages: InboundMessage[] = parsed.data.map((m) => ({
      externalId: String(m.id),
      threadId: m.thread_id != null ? String(m.thread_id) : null,
      athleteProfileUrl: m.athlete_url ?? null,
      athleteVolleyboxId: m.athlete_id != null ? String(m.athlete_id) : null,
      body: m.body,
      receivedAt: new Date(m.received_at),
    }));
    return { messages, cursor: parsed.next_cursor ?? cursor };
  }

  conversationUrl(threadId: string | null, profileUrl: string) {
    if (threadId && this.conversationTemplate) return this.conversationTemplate.replace("{thread_id}", encodeURIComponent(threadId));
    return profileUrl;
  }
}
