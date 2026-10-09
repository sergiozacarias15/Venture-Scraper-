import { describe, expect, it } from "vitest";
import { HttpDiscoveryAdapter, DiscoveryApiError } from "@/modules/discovery/adapters/http";
import { HttpMessagingAdapter } from "@/modules/messaging/adapters/http";
import { PermanentSendError, SendBlockedError, TransientSendError } from "@/modules/messaging/adapters/types";
import { signSession, verifyHmacSignature, verifySession } from "@/lib/session";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const msg = { messageId: "m1", athlete: { id: "a1", profileUrl: "https://volleybox.net/p/1", volleyboxId: null }, body: "hi", language: "en", threadId: null };
const adapter = (f: () => Response | Promise<Response>) => new HttpMessagingAdapter("https://api.test", "key", (async () => f()) as unknown as typeof fetch, "https://volleybox.net/messages/{thread_id}");

describe("HttpMessagingAdapter", () => {
  it("sends with an idempotency key and returns thread info", async () => {
    let seen: RequestInit | undefined;
    const a = new HttpMessagingAdapter("https://api.test", "key", (async (_u: string, init: RequestInit) => { seen = init; return json(200, { id: 5, thread_id: 9 }); }) as unknown as typeof fetch, "https://volleybox.net/messages/{thread_id}");
    const r = await a.send(msg);
    expect(r).toEqual({ externalId: "5", threadId: "9", conversationUrl: "https://volleybox.net/messages/9" });
    expect((seen!.headers as Record<string, string>)["Idempotency-Key"]).toBe("m1");
  });
  it("maps policy responses to SendBlockedError and never retries them", async () => {
    await expect(adapter(() => json(429, { message: "slow down" }, { "retry-after": "120" })).send(msg)).rejects.toMatchObject({ kind: "rate_limited" });
    await expect(adapter(() => json(403, { code: "captcha_required" })).send(msg)).rejects.toBeInstanceOf(SendBlockedError);
    await expect(adapter(() => json(403, { code: "account_restricted" })).send(msg)).rejects.toMatchObject({ kind: "account_restricted" });
  });
  it("classifies other failures", async () => {
    await expect(adapter(() => json(503, {})).send(msg)).rejects.toBeInstanceOf(TransientSendError);
    await expect(adapter(() => { throw new Error("socket hang up"); }).send(msg)).rejects.toBeInstanceOf(TransientSendError);
    await expect(adapter(() => json(422, { message: "recipient blocked messages" })).send(msg)).rejects.toBeInstanceOf(PermanentSendError);
  });
  it("parses inbound replies", async () => {
    const a = adapter(() => json(200, { data: [{ id: 1, thread_id: 2, body: "yes", received_at: "2026-10-09T10:00:00Z" }], next_cursor: "c2" }));
    const r = await a.fetchReplies(null);
    expect(r.cursor).toBe("c2");
    expect(r.messages[0]).toMatchObject({ externalId: "1", threadId: "2", body: "yes" });
  });
});

describe("HttpDiscoveryAdapter", () => {
  it("passes criteria as query params and maps results", async () => {
    let url = "";
    const a = new HttpDiscoveryAdapter("https://api.test", "key", (async (u: string) => { url = u; return json(200, { data: [{ id: 1, url: "https://volleybox.net/p/1", name: "Ana Lima", birth_year: 2008, nationality: "BR" }], next_cursor: null }); }) as unknown as typeof fetch);
    const page = await a.search({ birthYears: [2007, 2008], genders: ["female"], countries: ["BR"], positions: [] }, null, 50);
    expect(url).toContain("birth_year=2007%2C2008");
    expect(url).toContain("nationality=BR");
    expect(page.athletes[0]).toMatchObject({ fullName: "Ana Lima", birthYear: 2008 });
  });
  it("surfaces API errors (including rate limits) without retrying", async () => {
    const a = new HttpDiscoveryAdapter("https://api.test", "key", (async () => json(429, {})) as unknown as typeof fetch);
    await expect(a.search({ birthYears: [2007], genders: [], countries: ["IT"], positions: [] }, null, 10)).rejects.toBeInstanceOf(DiscoveryApiError);
  });
});

describe("session and webhook signatures", () => {
  it("signs, verifies and expires sessions", async () => {
    const t = await signSession("s3cret", 1000);
    expect(await verifySession("s3cret", t, 2000)).toBe(true);
    expect(await verifySession("other", t, 2000)).toBe(false);
    expect(await verifySession("s3cret", t, 1000 + 8 * 86_400_000)).toBe(false);
    expect(await verifySession("s3cret", undefined)).toBe(false);
    expect(await verifySession("", t)).toBe(false);
  });
  it("verifies HMAC webhook signatures", async () => {
    const crypto = await import("node:crypto");
    const sig = crypto.createHmac("sha256", "k").update("body").digest("hex");
    expect(await verifyHmacSignature("k", "body", sig)).toBe(true);
    expect(await verifyHmacSignature("k", "body", `sha256=${sig}`)).toBe(true);
    expect(await verifyHmacSignature("k", "tampered", sig)).toBe(false);
    expect(await verifyHmacSignature("", "body", sig)).toBe(false);
  });
});
