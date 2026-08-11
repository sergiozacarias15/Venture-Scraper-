import type { IncomingMessage, ServerResponse } from "node:http";
import { ZodError } from "zod";
import { assessmentRequestSchema } from "../server/assessment-schema";
import { buildAssessmentNote } from "../server/assessment-note";
import {
  createDeal,
  createDealNote,
  findDuplicateDeal,
  findOrCreatePerson,
  getPipedriveConfig,
  PipedriveConfigurationError,
  PipedriveError,
  resolveStageId,
  rollbackDeal,
} from "../server/pipedrive";
import {
  assertSameOrigin,
  enforceSpamAndRateLimits,
  markSubmissionCompleted,
  RequestSecurityError,
} from "../server/request-security";

interface ApiRequest extends IncomingMessage {
  body?: unknown;
}

interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

class DuplicateSubmissionError extends Error {}

const MAX_BODY_BYTES = 60_000;

async function readBody(request: ApiRequest) {
  if (request.body !== undefined) {
    const serialized = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    if (Buffer.byteLength(serialized) > MAX_BODY_BYTES) throw new RangeError("Request body is too large");
    return typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new RangeError("Request body is too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendError(response: ApiResponse, status: number, code: string) {
  return response.status(status).json({ success: false, code });
}

export default async function submitAssessment(request: ApiRequest, response: ApiResponse) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendError(response, 405, "method_not_allowed");
  }

  if (!request.headers["content-type"]?.toString().toLowerCase().startsWith("application/json")) {
    return sendError(response, 415, "invalid_content_type");
  }

  try {
    assertSameOrigin(request);
    const rawBody = await readBody(request);
    const payload = assessmentRequestSchema.parse(rawBody);
    enforceSpamAndRateLimits(request, payload);

    const config = getPipedriveConfig();
    const stageId = await resolveStageId(config);

    const person = await findOrCreatePerson(config, payload.answers);
    const dealTitle = `${payload.answers.fullName} - College Volleyball Application`;
    if (await findDuplicateDeal(config, dealTitle, person.id)) throw new DuplicateSubmissionError();

    const deal = await createDeal(config, dealTitle, person.id, stageId);
    const submittedAt = new Date().toISOString();
    const note = buildAssessmentNote(
      payload.answers,
      payload.context.language,
      submittedAt,
      payload.context.clientSubmissionId,
    );

    try {
      await createDealNote(config, deal.id, person.id, note);
    } catch (error) {
      await rollbackDeal(config, deal.id);
      throw error;
    }

    markSubmissionCompleted(payload.context.clientSubmissionId);
    return response.status(201).json({
      success: true,
      reference: `VB-${deal.id}`,
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return sendError(response, 400, "invalid_submission");
    }
    if (error instanceof RangeError) return sendError(response, 413, "payload_too_large");
    if (error instanceof RequestSecurityError) return sendError(response, error.status, error.code);
    if (error instanceof DuplicateSubmissionError) return sendError(response, 409, "duplicate");
    if (error instanceof PipedriveConfigurationError) {
      return response.status(500).json({
        success: false,
        code: "configuration_error",
        message: error.message,
      });
    }
    if (error instanceof PipedriveError && error.status === 409) return sendError(response, 409, "contact_conflict");
    return sendError(response, 502, "submission_failed");
  }
}
