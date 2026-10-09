import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getVolleyboxMode } from "@/lib/env";
import { verifyHmacSignature } from "@/lib/session";
import { safeIngest } from "@/modules/responses/service";

export const dynamic = "force-dynamic";

const payload = z.object({
  id: z.union([z.string(), z.number()]),
  thread_id: z.union([z.string(), z.number()]).nullish(),
  athlete_url: z.string().nullish(),
  athlete_id: z.union([z.string(), z.number()]).nullish(),
  body: z.string().min(1),
  received_at: z.string().optional(),
});

/** Inbound replies pushed by an authorized Volleybox integration. Requests must carry an HMAC signature. */
export async function POST(req: Request) {
  const secret = process.env.VOLLEYBOX_WEBHOOK_SECRET ?? "";
  const raw = await req.text();
  if (!(await verifyHmacSignature(secret, raw, req.headers.get("x-signature")))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const parsed = payload.safeParse(JSON.parse(raw));
  if (!parsed.success) return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  const p = parsed.data;
  const adapterId = getVolleyboxMode().mode === "live" ? "volleybox-api" : "mock";
  const result = await safeIngest(getDb(), adapterId, {
    externalId: String(p.id),
    threadId: p.thread_id != null ? String(p.thread_id) : null,
    athleteProfileUrl: p.athlete_url ?? null,
    athleteVolleyboxId: p.athlete_id != null ? String(p.athlete_id) : null,
    body: p.body,
    receivedAt: p.received_at ? new Date(p.received_at) : new Date(),
  });
  return NextResponse.json(result);
}
