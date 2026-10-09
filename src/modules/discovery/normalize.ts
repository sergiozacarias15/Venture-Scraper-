import { normalizeCountry } from "@/lib/countries";
import type { DiscoveredAthlete } from "./types";

const ALLOWED_HOST_SUFFIXES = ["volleybox.net", "volleybox.test"];

/** Canonical profile URL used as the dedupe key. Returns null for non-Volleybox URLs. */
export function normalizeProfileUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!ALLOWED_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) return null;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return null;
  return `https://${host}${path}`;
}

export function normalizeGender(input: string | null | undefined): "female" | "male" | null {
  const v = input?.trim().toLowerCase();
  if (!v) return null;
  if (["f", "female", "woman", "women", "w", "femminile", "femenino", "feminino", "donna", "mujer", "mulher"].includes(v)) return "female";
  if (["m", "male", "man", "men", "maschile", "masculino", "uomo", "hombre", "homem"].includes(v)) return "male";
  return null;
}

export const POSITIONS = ["Outside Hitter", "Opposite", "Middle Blocker", "Setter", "Libero"] as const;

const POSITION_ALIASES: Record<string, (typeof POSITIONS)[number]> = {
  "outside hitter": "Outside Hitter", oh: "Outside Hitter", "outside spiker": "Outside Hitter", wing: "Outside Hitter",
  "wing spiker": "Outside Hitter", schiacciatore: "Outside Hitter", "schiacciatrice": "Outside Hitter", receptor: "Outside Hitter",
  "ponta": "Outside Hitter", "ponteiro": "Outside Hitter", "ponteira": "Outside Hitter", "punta": "Outside Hitter",
  opposite: "Opposite", opp: "Opposite", "opposite hitter": "Opposite", "opposto": "Opposite", "opuesto": "Opposite", "oposto": "Opposite", "diagonal": "Opposite",
  "middle blocker": "Middle Blocker", middle: "Middle Blocker", mb: "Middle Blocker", "middle hitter": "Middle Blocker", centrale: "Middle Blocker",
  central: "Middle Blocker", "centro": "Middle Blocker",
  setter: "Setter", s: "Setter", palleggiatore: "Setter", "palleggiatrice": "Setter", colocador: "Setter", "levantador": "Setter", "levantadora": "Setter", "armador": "Setter",
  libero: "Libero", líbero: "Libero", l: "Libero",
};

export function normalizePosition(input: string | null | undefined): string | null {
  const v = input?.trim().toLowerCase();
  if (!v) return null;
  return POSITION_ALIASES[v] ?? null;
}

export function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return { firstName: parts[0] ?? fullName.trim() };
}

export function normalizeAthlete(a: DiscoveredAthlete): (DiscoveredAthlete & { profileUrl: string; nationality: string | null }) | null {
  const profileUrl = normalizeProfileUrl(a.profileUrl);
  const fullName = a.fullName?.trim();
  if (!profileUrl || !fullName) return null;
  let birthYear = a.birthYear ?? null;
  if (!birthYear && a.birthDate) birthYear = Number(a.birthDate.slice(0, 4)) || null;
  if (birthYear && (birthYear < 1950 || birthYear > 2030)) birthYear = null;
  return {
    ...a,
    profileUrl,
    fullName,
    birthYear,
    gender: normalizeGender(a.gender),
    nationality: normalizeCountry(a.nationality),
    position: normalizePosition(a.position) ?? (a.position?.trim() || null),
    instagram: a.instagram?.trim().replace(/^@/, "") || null,
  };
}
