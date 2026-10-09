export type OutboundMessage = {
  /** Our message id, passed to the integration as an idempotency key. */
  messageId: string;
  athlete: { id: string; profileUrl: string; volleyboxId: string | null };
  body: string;
  language: string;
  threadId: string | null;
};

export type SendResult = { externalId: string; threadId: string; conversationUrl?: string };

export type InboundMessage = {
  externalId: string;
  threadId: string | null;
  athleteProfileUrl?: string | null;
  athleteVolleyboxId?: string | null;
  body: string;
  receivedAt: Date;
};

/** Volleybox (or the account) asked us to slow down or stop. We never retry around these. */
export class SendBlockedError extends Error {
  constructor(
    public kind: "rate_limited" | "captcha" | "account_restricted" | "messaging_disabled",
    message: string,
    public retryAfter?: Date,
  ) {
    super(message);
  }
}
/** The recipient cannot be messaged; do not retry. */
export class PermanentSendError extends Error {}
/** Temporary failure (network, 5xx); safe to retry with backoff. */
export class TransientSendError extends Error {}

export interface MessagingAdapter {
  id: string;
  /** true only for a real, authorized programmatic channel. No such channel exists today. */
  live: boolean;
  /** true when a human performs the send and confirms it in the app. */
  manual?: boolean;
  send(msg: OutboundMessage): Promise<SendResult>;
  fetchReplies(cursor: string | null): Promise<{ messages: InboundMessage[]; cursor: string | null }>;
  conversationUrl(threadId: string | null, profileUrl: string): string;
}
