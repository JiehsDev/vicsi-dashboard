// src/app/api/v1/health/route.ts
import { NextResponse } from "next/server";

/** Unauthenticated liveness probe. Deliberately reveals nothing about env
 *  vars, infra, or dependencies — just confirms the Next.js server itself
 *  is up and routing to /api/v1. */
export async function GET() {
  return NextResponse.json({
    success: true,
    service: "vicsi-dashboard",
    status: "healthy",
    timeUtc: new Date().toISOString(),
  });
}
