import type { AssessmentAnswers } from "./assessment-schema";

export class PipedriveError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
  }
}

export class PipedriveConfigurationError extends PipedriveError {
  constructor(message: string) {
    super(message, 500);
  }
}

interface PipedriveConfig {
  baseUrl: string;
  token: string;
  ownerId: number;
  pipelineId: number;
  stageId?: number;
}

interface SearchItem {
  item: {
    id: number;
    title?: string;
    emails?: Array<string | { value: string }>;
    phones?: Array<string | { value: string }>;
    person?: { id: number } | null;
  };
}

interface PipedriveResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

const positiveInteger = (value: string | undefined, name: string) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new PipedriveError(`Missing or invalid ${name}`, 500);
  return parsed;
};

export function getPipedriveConfig(): PipedriveConfig {
  const token = process.env.PIPEDRIVE_API_TOKEN;
  const rawDomain = process.env.PIPEDRIVE_COMPANY_DOMAIN;
  if (!token || !rawDomain) throw new PipedriveError("Pipedrive is not configured", 500);

  const companyDomain = rawDomain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\.pipedrive\.com\/?$/, "");

  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(companyDomain)) {
    throw new PipedriveError("Invalid Pipedrive company domain", 500);
  }

  const pipelineId = positiveInteger(process.env.PIPEDRIVE_PIPELINE_ID, "PIPEDRIVE_PIPELINE_ID");
  if (pipelineId !== 2) throw new PipedriveError("Pipedrive pipeline must be ID 2", 500);

  const configuredStage = process.env.PIPEDRIVE_STAGE_ID?.trim();
  return {
    baseUrl: `https://${companyDomain}.pipedrive.com`,
    token,
    ownerId: positiveInteger(process.env.PIPEDRIVE_OWNER_ID, "PIPEDRIVE_OWNER_ID"),
    pipelineId,
    stageId: configuredStage ? positiveInteger(configuredStage, "PIPEDRIVE_STAGE_ID") : undefined,
  };
}

async function request<T>(
  config: PipedriveConfig,
  path: string,
  options: { method?: "GET" | "POST" | "DELETE"; body?: unknown; version?: "v1" | "v2" } = {},
) {
  const versionPath = options.version === "v1" ? "/api/v1" : "/api/v2";
  const response = await fetch(`${config.baseUrl}${versionPath}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-api-token": config.token,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) throw new PipedriveError("Pipedrive request failed");
  const payload = (await response.json()) as PipedriveResponse<T>;
  if (!payload.success || payload.data === undefined) throw new PipedriveError("Pipedrive rejected the request");
  return payload.data;
}

const valueOf = (entry: string | { value: string }) => (typeof entry === "string" ? entry : entry.value);
const normalizePhone = (value: string) => value.replace(/\D/g, "");

async function searchPerson(config: PipedriveConfig, term: string, field: "email" | "phone") {
  const parameters = new URLSearchParams({
    term,
    fields: field,
    exact_match: "true",
    limit: "20",
  });
  const data = await request<{ items: SearchItem[] }>(config, `/persons/search?${parameters.toString()}`);
  return (data.items ?? [])
    .map(({ item }) => item)
    .filter((person) => {
      if (field === "email") {
        return (person.emails ?? []).some((entry) => valueOf(entry).toLowerCase() === term.toLowerCase());
      }
      const expected = normalizePhone(term);
      return (person.phones ?? []).some((entry) => normalizePhone(valueOf(entry)) === expected);
    });
}

export async function findOrCreatePerson(config: PipedriveConfig, answers: AssessmentAnswers) {
  const [emailMatches, phoneMatches] = await Promise.all([
    searchPerson(config, answers.email, "email"),
    searchPerson(config, answers.whatsapp, "phone"),
  ]);

  const matchedIds = new Set([...emailMatches, ...phoneMatches].map(({ id }) => id));
  if (matchedIds.size > 1) throw new PipedriveError("Contact details match different Pipedrive persons", 409);
  if (matchedIds.size === 1) return { id: [...matchedIds][0], created: false };

  const person = await request<{ id: number }>(config, "/persons", {
    method: "POST",
    body: {
      name: answers.fullName,
      owner_id: config.ownerId,
      emails: [{ value: answers.email, label: "work", primary: true }],
      phones: [{ value: answers.whatsapp, label: "mobile", primary: true }],
    },
  });
  return { id: person.id, created: true };
}

interface Stage {
  id: number;
  name: string;
  pipeline_id?: number;
  pipeline?: { id: number };
  is_deleted?: boolean;
}

const stageCache = new Map<string, { id: number; expiresAt: number }>();
const STAGE_CACHE_TTL_MS = 30 * 60 * 1_000;

const isTargetStage = (stage: Stage, config: PipedriveConfig) => {
  const pipelineId = stage.pipeline_id ?? stage.pipeline?.id;
  return (
    stage.name === "NEW PLAYER (LEAD)" &&
    pipelineId === config.pipelineId &&
    stage.is_deleted !== true
  );
};

export async function resolveStageId(config: PipedriveConfig) {
  const cacheKey = `${config.baseUrl}:${config.pipelineId}:${config.stageId ?? "auto"}`;
  const cached = stageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.id;

  let stageId: number;
  if (config.stageId) {
    const stage = await request<Stage>(config, `/stages/${config.stageId}`);
    if (stage.id !== config.stageId || !isTargetStage(stage, config)) {
      throw new PipedriveConfigurationError(
        "PIPEDRIVE_STAGE_ID must identify the stage named exactly NEW PLAYER (LEAD) in pipeline 2.",
      );
    }
    stageId = stage.id;
  } else {
    const parameters = new URLSearchParams({
      pipeline_id: String(config.pipelineId),
      limit: "500",
      sort_by: "id",
      sort_direction: "asc",
    });
    const stages = await request<Stage[]>(config, `/stages?${parameters.toString()}`);
    const matches = stages.filter((stage) => isTargetStage(stage, config));
    if (matches.length !== 1) {
      throw new PipedriveConfigurationError(
        matches.length === 0
          ? "No stage named exactly NEW PLAYER (LEAD) was found in pipeline 2."
          : "Multiple stages named exactly NEW PLAYER (LEAD) were found in pipeline 2.",
      );
    }
    stageId = matches[0].id;
  }

  stageCache.set(cacheKey, { id: stageId, expiresAt: Date.now() + STAGE_CACHE_TTL_MS });
  return stageId;
}

export async function findDuplicateDeal(config: PipedriveConfig, title: string, personId: number) {
  const parameters = new URLSearchParams({
    term: title,
    fields: "title",
    exact_match: "true",
    person_id: String(personId),
    status: "open",
    limit: "20",
  });
  const data = await request<{ items: SearchItem[] }>(config, `/deals/search?${parameters.toString()}`);
  return (data.items ?? []).some(({ item }) => item.title?.toLowerCase() === title.toLowerCase());
}

export async function createDeal(config: PipedriveConfig, title: string, personId: number, stageId: number) {
  return request<{ id: number }>(config, "/deals", {
    method: "POST",
    body: {
      title,
      owner_id: config.ownerId,
      person_id: personId,
      pipeline_id: config.pipelineId,
      stage_id: stageId,
      value: 4495,
      currency: "USD",
      status: "open",
    },
  });
}

export async function createDealNote(
  config: PipedriveConfig,
  dealId: number,
  personId: number,
  content: string,
) {
  return request<{ id: number }>(config, "/notes", {
    method: "POST",
    version: "v1",
    body: {
      content,
      deal_id: dealId,
      person_id: personId,
      pinned_to_deal_flag: 1,
    },
  });
}

export async function rollbackDeal(config: PipedriveConfig, dealId: number) {
  try {
    await request<unknown>(config, `/deals/${dealId}`, { method: "DELETE" });
  } catch {
    // The original submission still fails; the existing deal prevents a duplicate on retry.
  }
}

export function resetStageCacheForTests() {
  stageCache.clear();
}

export type { PipedriveConfig };
