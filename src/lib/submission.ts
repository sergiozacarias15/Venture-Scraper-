import type { AssessmentSubmissionRequest } from "./assessment";

export interface SubmissionResult {
  id: string;
}

export class SubmissionError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export async function submitAssessment(payload: AssessmentSubmissionRequest): Promise<SubmissionResult> {
  const response = await fetch("/api/submit-assessment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = (await response.json().catch(() => null)) as
    | { success: true; reference: string }
    | { success: false; code: string }
    | null;

  if (!response.ok || !result?.success) {
    throw new SubmissionError(result && "code" in result ? result.code : "submission_failed");
  }
  return { id: result.reference };
}
