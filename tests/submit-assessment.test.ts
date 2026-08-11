import { beforeEach, describe, expect, it, vi } from "vitest";
import submitAssessment from "../api/submit-assessment";
import {
  getPipedriveConfig,
  PipedriveConfigurationError,
  resetStageCacheForTests,
  resolveStageId,
} from "../server/pipedrive";
import { resetSecurityStateForTests } from "../server/request-security";

const answers = {
  fullName: "Test Athlete",
  birthDate: "2004-04-12",
  nationality: "Italian",
  residenceCountry: "Italy",
  cityCountry: "Milan, Italy",
  email: "athlete@example.test",
  whatsapp: "+39 333 123 4567",
  height: "183 cm",
  dominantHand: "right",
  primaryPosition: "outside",
  secondaryPosition: "opposite",
  currentClub: "Test Volleyball Club",
  currentCategory: "Serie B",
  experienceYears: "8",
  highestLevel: "National league",
  representativeExperience: "Regional U19 team",
  achievements: "Regional champion",
  coachName: "Test Coach",
  coachContact: "coach@example.test",
  schoolName: "Test School",
  academicAverage: "8.5/10",
  graduationYear: "2027",
  englishLevel: "advanced",
  intendedMajor: "Business",
  highlightVideo: "https://example.test/highlights",
  fullMatchVideo: "https://example.test/match",
  profileLink: "https://example.test/profile",
  startYear: "2027",
  annualBudget: "20to30",
  mainGoal: "scholarship",
  concern: "Finding the right academic fit",
  marketingSource: "instagram",
  guardianName: "",
  guardianEmail: "",
  guardianWhatsapp: "",
  guardianConsent: false,
  privacyConsent: true,
  contactConsent: true,
};

const validBody = () => ({
  answers,
  context: {
    language: "en",
    sourceRoute: "/sergiozacarias",
    formStartedAt: Date.now() - 10_000,
    clientSubmissionId: crypto.randomUUID(),
    website: "",
  },
});

function request(body = validBody()) {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://assessment.example.test",
      host: "assessment.example.test",
      "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}`,
    },
    socket: { remoteAddress: "198.51.100.10" },
    body,
  };
}

function response() {
  const result = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return result;
}

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("POST /api/submit-assessment", () => {
  beforeEach(() => {
    resetSecurityStateForTests();
    resetStageCacheForTests();
    vi.restoreAllMocks();
    process.env.PIPEDRIVE_API_TOKEN = "test-token-never-sent-to-production";
    process.env.PIPEDRIVE_COMPANY_DOMAIN = "test-company";
    process.env.PIPEDRIVE_OWNER_ID = "42";
    process.env.PIPEDRIVE_PIPELINE_ID = "2";
    process.env.PIPEDRIVE_STAGE_ID = "7";
  });

  it("creates a Deal and note only after validation and duplicate checks", async () => {
    const calls: Array<{ url: string; method: string; body?: Record<string, unknown>; token: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({
        url,
        method,
        body,
        token: new Headers(init?.headers).get("x-api-token"),
      });

      if (url.endsWith("/api/v2/stages/7")) {
        return jsonResponse({ success: true, data: { id: 7, name: "NEW PLAYER (LEAD)", pipeline_id: 2 } });
      }
      if (url.includes("/api/v2/persons/search")) {
        return jsonResponse({ success: true, data: { items: [] } });
      }
      if (url.endsWith("/api/v2/persons") && method === "POST") {
        return jsonResponse({ success: true, data: { id: 88 } });
      }
      if (url.includes("/api/v2/deals/search")) {
        return jsonResponse({ success: true, data: { items: [] } });
      }
      if (url.endsWith("/api/v2/deals") && method === "POST") {
        return jsonResponse({ success: true, data: { id: 901 } });
      }
      if (url.endsWith("/api/v1/notes") && method === "POST") {
        return jsonResponse({ success: true, data: { id: 902 } });
      }
      throw new Error(`Unexpected mocked request: ${method} ${url}`);
    }));

    const res = response();
    await submitAssessment(request() as never, res as never);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, reference: "VB-901" });
    expect(calls.every(({ token }) => token === "test-token-never-sent-to-production")).toBe(true);

    const personCall = calls.find(({ url, method }) => url.endsWith("/api/v2/persons") && method === "POST");
    expect(personCall?.body).toMatchObject({
      name: "Test Athlete",
      owner_id: 42,
      emails: [{ value: "athlete@example.test", label: "work", primary: true }],
      phones: [{ value: "+39 333 123 4567", label: "mobile", primary: true }],
    });

    const dealCall = calls.find(({ url, method }) => url.endsWith("/api/v2/deals") && method === "POST");
    expect(dealCall?.body).toMatchObject({
      title: "Test Athlete - College Volleyball Application",
      owner_id: 42,
      person_id: 88,
      pipeline_id: 2,
      stage_id: 7,
      value: 4495,
      currency: "USD",
    });

    const noteCall = calls.find(({ url }) => url.endsWith("/api/v1/notes"));
    expect(noteCall?.body?.content).toContain("Highlight video");
    expect(noteCall?.body?.content).toContain("Privacy/GDPR consent");
    expect(noteCall?.body?.content).toContain("Selected language");
    expect(noteCall?.body?.content).toContain("Submission date (UTC)");
  });

  it("rejects invalid submissions without contacting Pipedrive", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const body = validBody();
    body.answers = { ...body.answers, email: "not-an-email" };
    const res = response();

    await submitAssessment(request(body) as never, res as never);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, code: "invalid_submission" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prevents an existing application Deal from being created again", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/v2/stages/7")) {
        return jsonResponse({ success: true, data: { id: 7, name: "NEW PLAYER (LEAD)", pipeline_id: 2 } });
      }
      if (url.includes("/api/v2/persons/search")) {
        return jsonResponse({
          success: true,
          data: { items: [{ item: { id: 88, emails: [answers.email], phones: [answers.whatsapp] } }] },
        });
      }
      if (url.includes("/api/v2/deals/search")) {
        return jsonResponse({
          success: true,
          data: { items: [{ item: { id: 901, title: "Test Athlete - College Volleyball Application" } }] },
        });
      }
      throw new Error(`Unexpected mocked request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = response();

    await submitAssessment(request() as never, res as never);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ success: false, code: "duplicate" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("rolls back a created Deal when its assessment note fails", async () => {
    const methods: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      methods.push(`${method} ${url}`);
      if (url.endsWith("/api/v2/stages/7")) {
        return jsonResponse({ success: true, data: { id: 7, name: "NEW PLAYER (LEAD)", pipeline_id: 2 } });
      }
      if (url.includes("/api/v2/persons/search")) {
        return jsonResponse({
          success: true,
          data: { items: [{ item: { id: 88, emails: [answers.email], phones: [answers.whatsapp] } }] },
        });
      }
      if (url.includes("/api/v2/deals/search")) return jsonResponse({ success: true, data: { items: [] } });
      if (url.endsWith("/api/v2/deals") && method === "POST") {
        return jsonResponse({ success: true, data: { id: 901 } });
      }
      if (url.endsWith("/api/v1/notes")) return jsonResponse({ success: false, error: "mock failure" }, 500);
      if (url.endsWith("/api/v2/deals/901") && method === "DELETE") {
        return jsonResponse({ success: true, data: null });
      }
      throw new Error(`Unexpected mocked request: ${method} ${url}`);
    }));
    const res = response();

    await submitAssessment(request() as never, res as never);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ success: false, code: "submission_failed" });
    expect(methods.some((call) => call.startsWith("DELETE ") && call.endsWith("/api/v2/deals/901"))).toBe(true);
  });
});

describe("automatic Pipedrive stage resolution", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetStageCacheForTests();
    process.env.PIPEDRIVE_API_TOKEN = "test-token-never-sent-to-production";
    process.env.PIPEDRIVE_COMPANY_DOMAIN = "test-company";
    process.env.PIPEDRIVE_OWNER_ID = "42";
    process.env.PIPEDRIVE_PIPELINE_ID = "2";
    delete process.env.PIPEDRIVE_STAGE_ID;
  });

  it("finds the exact stage in pipeline 2 and caches its numeric ID", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        success: true,
        data: [
          { id: 6, name: "CONTACTED", pipeline_id: 2, is_deleted: false },
          { id: 7, name: "NEW PLAYER (LEAD)", pipeline_id: 2, is_deleted: false },
          { id: 8, name: "NEW PLAYER (LEAD)", pipeline_id: 3, is_deleted: false },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const config = getPipedriveConfig();

    await expect(resolveStageId(config)).resolves.toBe(7);
    await expect(resolveStageId(config)).resolves.toBe(7);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/v2/stages?pipeline_id=2");
  });

  it("returns a clear configuration error when the exact stage is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          success: true,
          data: [{ id: 6, name: "New Player (Lead)", pipeline_id: 2, is_deleted: false }],
        }),
      ),
    );

    await expect(resolveStageId(getPipedriveConfig())).rejects.toEqual(
      new PipedriveConfigurationError("No stage named exactly NEW PLAYER (LEAD) was found in pipeline 2."),
    );
  });
});
