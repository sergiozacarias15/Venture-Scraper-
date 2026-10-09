import type { InboundMessage, MessagingAdapter, OutboundMessage, SendResult } from "./types";

/** Demo/test channel. "Delivers" nothing; records what would have been sent so the queue can be exercised. */
export class MockMessagingAdapter implements MessagingAdapter {
  id = "mock";
  live = false;
  sent: OutboundMessage[] = [];
  /** Errors to throw on upcoming send() calls, in order (for tests / failure drills). */
  failures: Error[] = [];
  inbox: InboundMessage[] = [];

  async send(msg: OutboundMessage): Promise<SendResult> {
    const failure = this.failures.shift();
    if (failure) throw failure;
    this.sent.push(msg);
    const threadId = msg.threadId ?? `mock-thread-${msg.athlete.id}`;
    return { externalId: `mock-out-${msg.messageId}`, threadId, conversationUrl: this.conversationUrl(threadId, msg.athlete.profileUrl) };
  }

  async fetchReplies(): Promise<{ messages: InboundMessage[]; cursor: string | null }> {
    const messages = this.inbox;
    this.inbox = [];
    return { messages, cursor: null };
  }

  conversationUrl(threadId: string | null, profileUrl: string) {
    return threadId ? `https://mock.volleybox.test/messages/${threadId}` : profileUrl;
  }
}
