import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { defaultDeps } from "@/modules/jobs/handlers";
import { tick } from "@/modules/jobs/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Called by Vercel Cron (or any scheduler) every minute: schedules recurring jobs and runs what is due. */
async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await tick(getDb(), defaultDeps());
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
