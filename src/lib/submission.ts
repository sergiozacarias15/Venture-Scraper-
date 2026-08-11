import { createClient } from "@supabase/supabase-js";
import type { AssessmentSubmission } from "./assessment";

export interface SubmissionResult {
  id: string;
}

const STORAGE_KEY = "venture-volleyball-mock-submissions";

async function submitToMock(payload: AssessmentSubmission): Promise<SubmissionResult> {
  await new Promise((resolve) => window.setTimeout(resolve, 900));
  const id = `VB-${Date.now().toString(36).toUpperCase()}`;
  const previous = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown[];
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...previous, { id, ...payload }]));
  return { id };
}

async function submitToSupabase(payload: AssessmentSubmission): Promise<SubmissionResult> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase environment variables are missing.");

  const supabase = createClient(url, anonKey);
  const { data, error } = await supabase
    .from("volleyball_assessments")
    .insert({ payload, ...payload.metadata })
    .select("id")
    .single();

  if (error) throw error;
  return { id: String(data.id) };
}

export function submitAssessment(payload: AssessmentSubmission) {
  return import.meta.env.VITE_SUBMISSION_MODE === "supabase"
    ? submitToSupabase(payload)
    : submitToMock(payload);
}
