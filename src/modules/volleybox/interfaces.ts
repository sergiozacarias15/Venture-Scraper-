import { countryByCode } from "@/lib/countries";
import type { DiscoveryCriteria } from "@/modules/discovery/types";

/**
 * The Volleybox surfaces we know exist, as confirmed by the operator by using the site as a member.
 * Nothing here is an API. Automated access to any of them is NOT authorized and NOT tested, so the app
 * only supports using them by hand. Update `automation`/`tested` only after Volleybox grants permission
 * and the integration has actually been exercised.
 */
export const RANKING_URL = "https://volleybox.net/players/ranking";
export const INBOX_URL_PREFIX = "https://volleybox.net/pm/inbox/";

export type Surface = {
  id: "ranking" | "pm_inbox";
  name: string;
  url: string;
  confirmed: string;
  appSupport: string;
  automation: "not_authorized";
  tested: false;
};

export const SURFACES: Surface[] = [
  {
    id: "ranking",
    name: "Player ranking / discovery page",
    url: RANKING_URL,
    confirmed: "Operator-confirmed: filters for birthdate, country, position, tournament and height. Men/Women sections are separate. Filter URL parameters are unknown, so links open the unfiltered page.",
    appSupport: "Guided manual workflow: one pass per birth year x country (x gender), you set the filters on Volleybox and paste what you reviewed; the app filters, dedupes and tracks passes.",
    automation: "not_authorized",
    tested: false,
  },
  {
    id: "pm_inbox",
    name: "Private-message inbox",
    url: "https://volleybox.net/pm/inbox",
    confirmed: `Operator-confirmed: conversations live at ${INBOX_URL_PREFIX}{conversation_id}, with a message composer and a send button.`,
    appSupport: "You send in Volleybox's composer and confirm in the app, pasting the conversation link. The app stores the link, opens it for reply checks, and tracks duplicates, caps and replies.",
    automation: "not_authorized",
    tested: false,
  },
];

export type ConversationRef = { id: string; url: string };

/** Accepts a /pm/inbox/{id} link (query/hash/trailing slash tolerated) or a bare id. */
export function parseConversationRef(input: string | null | undefined): ConversationRef | null {
  const v = input?.trim();
  if (!v) return null;
  const idPattern = /^[A-Za-z0-9_-]{1,64}$/;
  if (idPattern.test(v)) return { id: v, url: `${INBOX_URL_PREFIX}${v}` };
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "volleybox.net" || url.protocol !== "https:") return null;
  const m = url.pathname.match(/^\/pm\/inbox\/([A-Za-z0-9_-]{1,64})\/?$/);
  return m ? { id: m[1], url: `${INBOX_URL_PREFIX}${m[1]}` } : null;
}

export type RankingPass = { birthYear: number; country: string; gender: "female" | "male" };

/** One manual pass per birth year x country x gender section, so each search stays small and reviewable. */
export function rankingPasses(c: DiscoveryCriteria): RankingPass[] {
  const out: RankingPass[] = [];
  for (const gender of c.genders as ("female" | "male")[]) {
    for (const country of c.countries) {
      for (const birthYear of [...c.birthYears].sort()) out.push({ birthYear, country, gender });
    }
  }
  return out;
}

export function describePass(p: RankingPass) {
  return `${p.gender === "female" ? "Women" : "Men"} - born ${p.birthYear} - ${countryByCode(p.country)?.name ?? p.country}`;
}

export type RankingLine = { name: string; profileUrl: string; position: string | null };

/**
 * Parses what the operator pasted after reviewing a filtered ranking page: one athlete per line with the
 * profile link and name (any order; separated by tab, pipe, comma or semicolon); a position may follow.
 * Anything not recognised is reported, never guessed.
 */
export function parseRankingLines(text: string, isPosition: (v: string) => boolean): { rows: RankingLine[]; errors: string[] } {
  const rows: RankingLine[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const url = line.match(/https?:\/\/[^\s|,;\t]+/)?.[0];
    if (!url) return void errors.push(`Line ${i + 1}: no profile link found`);
    const rest = line.replace(url, " ").split(/[|\t,;]+/).map((t) => t.trim()).filter((t) => t && !/^\d+$/.test(t));
    const position = rest.find(isPosition) ?? null;
    const name = rest.find((t) => t !== position);
    if (!name) return void errors.push(`Line ${i + 1}: no athlete name found (needed to personalize the message)`);
    rows.push({ name, profileUrl: url, position });
  });
  return { rows, errors };
}
