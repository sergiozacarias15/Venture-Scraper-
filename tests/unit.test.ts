import { describe, expect, it } from "vitest";
import { pickLanguage, normalizeCountry } from "@/lib/countries";
import { zonedParts } from "@/lib/time";
import { matchesCriteria } from "@/modules/discovery/criteria";
import { normalizeAthlete, normalizeProfileUrl } from "@/modules/discovery/normalize";
import { parseAthleteCsv } from "@/modules/discovery/adapters/csv";
import { checkContactEligibility, isPotentialMinor, requiresHumanApproval } from "@/modules/messaging/safeguards";
import { evaluateSendGate, retryDelayMinutes } from "@/modules/messaging/schedule";
import { renderMessage } from "@/modules/messaging/templates";
import { classifyReply } from "@/modules/responses/classifier";
import { getVolleyboxMode } from "@/lib/env";

const NOW = new Date("2026-10-09T15:00:00Z"); // Friday 11:00 in New York

describe("profile urls and normalization", () => {
  it("canonicalizes volleybox urls and rejects others", () => {
    expect(normalizeProfileUrl("HTTPS://www.Volleybox.net/player/anna-rossi-123/?ref=x#top")).toBe("https://volleybox.net/player/anna-rossi-123");
    expect(normalizeProfileUrl("https://example.com/player/1")).toBeNull();
    expect(normalizeProfileUrl("not a url")).toBeNull();
    expect(normalizeProfileUrl("https://volleybox.net/")).toBeNull();
  });
  it("normalizes athlete fields", () => {
    const a = normalizeAthlete({ profileUrl: "https://volleybox.net/p/1", fullName: " Ana Lima ", birthDate: "2008-03-02", gender: "Feminino", nationality: "Brasil", position: "Ponteira", instagram: "@ana" })!;
    expect(a).toMatchObject({ birthYear: 2008, gender: "female", nationality: "BR", position: "Outside Hitter", instagram: "ana" });
  });
  it("maps countries and languages", () => {
    expect(normalizeCountry("españa")).toBe("ES");
    expect(pickLanguage(null, "BR")).toBe("pt");
    expect(pickLanguage("it-IT", "US")).toBe("it");
    expect(pickLanguage("de", "DE")).toBe("en");
  });
});

describe("criteria", () => {
  const c = { birthYears: [2007, 2008], genders: ["female"], countries: ["IT"], positions: [] };
  it("filters on year, gender and nationality and rejects unknowns", () => {
    const base = { profileUrl: "x", fullName: "x", birthYear: 2007, gender: "female", nationality: "IT" };
    expect(matchesCriteria(base, c)).toBe(true);
    expect(matchesCriteria({ ...base, birthYear: 2011 }, c)).toBe(false);
    expect(matchesCriteria({ ...base, birthYear: null }, c)).toBe(false);
    expect(matchesCriteria({ ...base, gender: "male" }, c)).toBe(false);
    expect(matchesCriteria({ ...base, nationality: null }, c)).toBe(false);
    expect(matchesCriteria({ ...base, nationality: "ES" }, c)).toBe(false);
  });
});

describe("csv import", () => {
  it("parses flexible headers and reports bad rows", () => {
    const { athletes, errors } = parseAthleteCsv("Name,Volleybox URL,Birth Year,Country,Position\nAna Lima,https://volleybox.net/p/1,2008,Brazil,Setter\n,https://volleybox.net/p/2,2008,Brazil,Setter\n");
    expect(athletes).toHaveLength(1);
    expect(athletes[0]).toMatchObject({ fullName: "Ana Lima", birthYear: 2008, nationality: "Brazil" });
    expect(errors.length).toBe(1);
  });
});

describe("safeguards", () => {
  it("treats 2008-born athletes as potential minors in Oct 2026 but not 2007", () => {
    expect(isPotentialMinor({ birth_year: 2008 }, NOW)).toBe(true);
    expect(isPotentialMinor({ birth_year: 2007 }, NOW)).toBe(false);
    expect(isPotentialMinor({ birth_year: null }, NOW)).toBe(true);
  });
  it("uses exact birth dates when known", () => {
    expect(isPotentialMinor({ birth_year: 2008, birth_date: "2008-01-01" }, NOW)).toBe(false);
    expect(isPotentialMinor({ birth_year: 2008, birth_date: "2008-12-31" }, NOW)).toBe(true);
  });
  it("blocks contact below the minimum age and with unverified age", () => {
    expect(checkContactEligibility({ birth_year: 2010 }, 16, NOW)).toEqual({ eligible: true });
    expect(checkContactEligibility({ birth_year: 2012 }, 16, NOW)).toEqual({ eligible: false, reason: "too_young" });
    expect(checkContactEligibility({ birth_year: null }, 16, NOW)).toEqual({ eligible: false, reason: "unverified_age" });
  });
  it("always requires approval for minors", () => {
    expect(requiresHumanApproval({ birth_year: 2009 }, true, NOW)).toBe(true);
    expect(requiresHumanApproval({ birth_year: 2007 }, true, NOW)).toBe(false);
    expect(requiresHumanApproval({ birth_year: 2007 }, false, NOW)).toBe(true);
  });
});

describe("templates", () => {
  const base = { firstName: "Giulia", senderName: "Sam", org: "Venture Sports USA", club: "Modena VC", position: "Setter" };
  it.each(["en", "it", "es", "pt"] as const)("renders %s for every kind without leftovers", (language) => {
    for (const kind of ["intro", "followup"] as const) {
      for (const minor of [false, true]) {
        const text = renderMessage({ ...base, language, kind, minor });
        expect(text).toContain("Giulia");
        expect(text).toContain("Venture Sports USA".split(" ")[0]);
        expect(text).not.toMatch(/[{}]|undefined|null/);
        expect(text.length).toBeLessThan(700);
      }
    }
  });
  it("mentions a guardian for minors and offers an opt out", () => {
    expect(renderMessage({ ...base, language: "en", kind: "intro", minor: true })).toMatch(/parent or guardian/);
    expect(renderMessage({ ...base, language: "es", kind: "intro", minor: true })).toMatch(/tutor/);
    expect(renderMessage({ ...base, language: "it", kind: "intro", minor: false })).toMatch(/non ti contatterò più/);
  });
  it("never asks for private contact channels", () => {
    for (const language of ["en", "it", "es", "pt"] as const) {
      expect(renderMessage({ ...base, language, kind: "intro", minor: true })).not.toMatch(/whatsapp|instagram/i);
    }
  });
});

describe("send gate", () => {
  const settings = { outreach_enabled: true, sending_paused_until: null, timezone: "America/New_York", window_start_hour: 9, window_end_hour: 18, send_days: [1, 2, 3, 4, 5], daily_cap: 5, min_interval_seconds: 60 };
  it("allows inside the window", () => {
    expect(evaluateSendGate({ now: NOW, settings, sentLast24h: 0, lastSentAt: null }).allowed).toBe(true);
  });
  it("blocks when disabled, paused, outside window/day, capped or too soon", () => {
    expect(evaluateSendGate({ now: NOW, settings: { ...settings, outreach_enabled: false }, sentLast24h: 0, lastSentAt: null }).allowed).toBe(false);
    expect(evaluateSendGate({ now: NOW, settings: { ...settings, sending_paused_until: new Date(NOW.getTime() + 1000) }, sentLast24h: 0, lastSentAt: null }).allowed).toBe(false);
    expect(evaluateSendGate({ now: new Date("2026-10-09T03:00:00Z"), settings, sentLast24h: 0, lastSentAt: null }).allowed).toBe(false);
    expect(evaluateSendGate({ now: new Date("2026-10-10T15:00:00Z"), settings, sentLast24h: 0, lastSentAt: null }).allowed).toBe(false);
    expect(evaluateSendGate({ now: NOW, settings, sentLast24h: 5, lastSentAt: null }).allowed).toBe(false);
    const soon = evaluateSendGate({ now: NOW, settings, sentLast24h: 1, lastSentAt: new Date(NOW.getTime() - 30_000) });
    expect(soon.allowed).toBe(false);
    expect("retryAt" in soon && soon.retryAt).toEqual(new Date(NOW.getTime() + 30_000));
  });
  it("computes zoned parts and backoff", () => {
    expect(zonedParts(NOW, "America/New_York")).toEqual({ hour: 11, minute: 0, weekday: 5 });
    expect([1, 2, 3].map(retryDelayMinutes)).toEqual([1, 5, 25]);
  });
});

describe("reply classifier", () => {
  it.each([
    ["Yes, I'm interested! Tell me more", "interested"],
    ["Sì, mi interessa, mandami più dettagli", "interested"],
    ["Sí, me interesa mucho", "interested"],
    ["Tenho interesse, pode enviar mais informações?", "interested"],
    ["No thanks, not interested", "not_interested"],
    ["Non sono interessato, grazie", "not_interested"],
    ["No me interesa, gracias", "not_interested"],
    ["Não tenho interesse", "not_interested"],
    ["No.", "not_interested"],
    ["How much does it cost?", "question"],
    ["Quanto costa il programma?", "question"],
    ["¿Qué universidades hay?", "question"],
    ["I'm not sure", "question"],
  ])("classifies %s as %s", (text, expected) => {
    expect(classifyReply(text).category).toBe(expected);
  });
  it("detects opt-outs in four languages", () => {
    for (const t of ["Stop messaging me", "Non scrivermi più", "No me escribas más", "Não me escreva mais", "Please unsubscribe me"]) {
      const r = classifyReply(t);
      expect(r).toMatchObject({ category: "not_interested", optOut: true });
    }
  });
  it("sends unintelligible replies to review", () => {
    expect(classifyReply("👍")).toMatchObject({ category: "question", needsReview: true });
  });
});

describe("volleybox mode", () => {
  it("falls back to mock unless live is explicitly configured", () => {
    expect(getVolleyboxMode({}).mode).toBe("mock");
    expect(getVolleyboxMode({ VOLLEYBOX_MODE: "live" }).mode).toBe("mock");
    expect(getVolleyboxMode({ VOLLEYBOX_MODE: "live", VOLLEYBOX_API_BASE_URL: "https://x", VOLLEYBOX_API_KEY: "k" }).mode).toBe("live");
  });
});

import { capabilities, liveActivationChecklist } from "@/lib/integrations";
describe("integration status", () => {
  it("reports mock sending until live is fully configured", () => {
    const send = (env: Record<string, string>) => capabilities(env).find((c) => c.name.startsWith("Sending"))!.state;
    expect(send({})).toBe("mock");
    expect(send({ VOLLEYBOX_MODE: "live", VOLLEYBOX_API_BASE_URL: "https://x", VOLLEYBOX_API_KEY: "k" })).toBe("working");
    expect(capabilities({}).find((c) => c.name.startsWith("Pipedrive"))!.state).toBe("not_connected");
  });
  it("always leaves the human-confirmed items unticked", () => {
    const checks = liveActivationChecklist({ VOLLEYBOX_MODE: "live", VOLLEYBOX_API_BASE_URL: "https://x", VOLLEYBOX_API_KEY: "k", CRON_SECRET: "c" });
    expect(checks.find((c) => c.key === "authorization")!.ok).toBe(false);
    expect(checks.find((c) => c.key === "contract")!.ok).toBe(false);
    expect(checks.find((c) => c.key === "mode")!.ok).toBe(true);
  });
});
