import Papa from "papaparse";
import type { DiscoveredAthlete } from "../types";

const ALIASES: Record<string, string[]> = {
  fullName: ["name", "full_name", "fullname", "athlete", "player"],
  profileUrl: ["volleybox_url", "profile_url", "url", "profile", "volleybox"],
  birthYear: ["birth_year", "birthyear", "year_of_birth", "born", "yob"],
  birthDate: ["birth_date", "birthdate", "dob", "date_of_birth"],
  gender: ["gender", "sex"],
  nationality: ["nationality", "country", "citizenship"],
  position: ["position", "role"],
  club: ["club", "team"],
  instagram: ["instagram", "ig"],
  preferredLanguage: ["language", "preferred_language", "lang"],
};

/** Parses a CSV export (an authorized data source) into athlete records. */
export function parseAthleteCsv(text: string): { athletes: DiscoveredAthlete[]; errors: string[] } {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });
  const errors = parsed.errors.map((e) => `Row ${e.row ?? "?"}: ${e.message}`);
  const athletes: DiscoveredAthlete[] = [];
  parsed.data.forEach((row, idx) => {
    const pick = (field: string) => {
      for (const key of ALIASES[field]) if (row[key]?.trim()) return row[key].trim();
      return undefined;
    };
    const fullName = pick("fullName");
    const profileUrl = pick("profileUrl");
    if (!fullName || !profileUrl) {
      errors.push(`Row ${idx + 2}: name and volleybox_url are required`);
      return;
    }
    const birthYear = Number(pick("birthYear"));
    athletes.push({
      fullName,
      profileUrl,
      birthYear: Number.isInteger(birthYear) && birthYear > 0 ? birthYear : null,
      birthDate: pick("birthDate") ?? null,
      gender: pick("gender") ?? null,
      nationality: pick("nationality") ?? null,
      position: pick("position") ?? null,
      club: pick("club") ?? null,
      instagram: pick("instagram") ?? null,
      preferredLanguage: pick("preferredLanguage") ?? null,
      raw: row,
    });
  });
  return { athletes, errors };
}
