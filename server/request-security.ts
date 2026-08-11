import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { AssessmentRequest } from "./assessment-schema";

interface WindowEntry {
  count: number;
  resetAt: number;
}

interface SecurityState {
  rateLimits: Map<string, WindowEntry>;
  completedSubmissions: Map<string, number>;
}

const globalSecurity = globalThis as typeof globalThis & {
  __ventureAssessmentSecurity?: SecurityState;
};

const state =
  globalSecurity.__ventureAssessmentSecurity ??
  (globalSecurity.__ventureAssessmentSecurity = {
    rateLimits: new Map(),
    completedSubmissions: new Map(),
  });

const headerValue = (request: IncomingMessage, name: string) => {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");

export class RequestSecurityError extends Error {
  constructor(
    public readonly code: "forbidden" | "rate_limited" | "spam_detected" | "duplicate",
    public readonly status: number,
  ) {
    super(code);
  }
}

export function assertSameOrigin(request: IncomingMessage) {
  const origin = headerValue(request, "origin");
  const host = headerValue(request, "x-forwarded-host") ?? headerValue(request, "host");
  if (!origin || !host) throw new RequestSecurityError("forbidden", 403);

  try {
    if (new URL(origin).host !== host) throw new RequestSecurityError("forbidden", 403);
  } catch (error) {
    if (error instanceof RequestSecurityError) throw error;
    throw new RequestSecurityError("forbidden", 403);
  }
}

export function enforceSpamAndRateLimits(request: IncomingMessage, payload: AssessmentRequest) {
  const now = Date.now();
  if (payload.context.website !== "") throw new RequestSecurityError("spam_detected", 400);

  const elapsed = now - payload.context.formStartedAt;
  if (elapsed < 3_000 || elapsed > 24 * 60 * 60 * 1_000) {
    throw new RequestSecurityError("spam_detected", 400);
  }

  for (const [key, entry] of state.rateLimits) {
    if (entry.resetAt <= now) state.rateLimits.delete(key);
  }
  for (const [key, expiresAt] of state.completedSubmissions) {
    if (expiresAt <= now) state.completedSubmissions.delete(key);
  }

  const forwardedFor = headerValue(request, "x-forwarded-for")?.split(",")[0]?.trim();
  const clientAddress = forwardedFor || request.socket.remoteAddress || "unknown";
  const rateKey = fingerprint(clientAddress);
  const current = state.rateLimits.get(rateKey);

  if (!current || current.resetAt <= now) {
    state.rateLimits.set(rateKey, { count: 1, resetAt: now + 15 * 60 * 1_000 });
  } else {
    current.count += 1;
    if (current.count > 5) throw new RequestSecurityError("rate_limited", 429);
  }

  if (state.completedSubmissions.has(payload.context.clientSubmissionId)) {
    throw new RequestSecurityError("duplicate", 409);
  }
}

export function markSubmissionCompleted(clientSubmissionId: string) {
  state.completedSubmissions.set(clientSubmissionId, Date.now() + 24 * 60 * 60 * 1_000);
}

export function resetSecurityStateForTests() {
  state.rateLimits.clear();
  state.completedSubmissions.clear();
}
