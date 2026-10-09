import type { InboundMessage, MessagingAdapter, OutboundMessage, SendResult } from "./types";

/**
 * Volleybox has no public messaging API, so nothing is sent programmatically. Approved messages wait in a
 * "ready to send" list; the operator sends each one in Volleybox's own message form and confirms it here
 * (see confirmManualSend). This adapter exists so the rest of the pipeline treats it like any other channel.
 */
export class AssistedMessagingAdapter implements MessagingAdapter {
  id = "assisted";
  live = false;
  manual = true;

  async send(_msg: OutboundMessage): Promise<SendResult> {
    throw new Error("Assisted mode does not send automatically; the operator sends on Volleybox and confirms.");
  }

  async fetchReplies(): Promise<{ messages: InboundMessage[]; cursor: string | null }> {
    return { messages: [], cursor: null };
  }

  conversationUrl(_threadId: string | null, profileUrl: string) {
    return profileUrl;
  }
}
