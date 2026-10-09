import { NextResponse } from "next/server";
import { getVolleyboxMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, volleybox: getVolleyboxMode() });
}
