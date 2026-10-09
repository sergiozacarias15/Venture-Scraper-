export type Language = "en" | "it" | "es" | "pt";
export const LANGUAGES: Language[] = ["en", "it", "es", "pt"];
export const LANGUAGE_LABEL: Record<Language, string> = {
  en: "English",
  it: "Italiano",
  es: "Español",
  pt: "Português",
};

export type Country = { code: string; name: string; language: Language; aliases?: string[] };

export const COUNTRIES: Country[] = [
  { code: "IT", name: "Italy", language: "it", aliases: ["italia"] },
  { code: "ES", name: "Spain", language: "es", aliases: ["españa", "espana"] },
  { code: "PT", name: "Portugal", language: "pt" },
  { code: "BR", name: "Brazil", language: "pt", aliases: ["brasil"] },
  { code: "AR", name: "Argentina", language: "es" },
  { code: "MX", name: "Mexico", language: "es", aliases: ["méxico"] },
  { code: "CO", name: "Colombia", language: "es" },
  { code: "CL", name: "Chile", language: "es" },
  { code: "PE", name: "Peru", language: "es", aliases: ["perú"] },
  { code: "VE", name: "Venezuela", language: "es" },
  { code: "UY", name: "Uruguay", language: "es" },
  { code: "PY", name: "Paraguay", language: "es" },
  { code: "DO", name: "Dominican Republic", language: "es" },
  { code: "CU", name: "Cuba", language: "es" },
  { code: "PR", name: "Puerto Rico", language: "es" },
  { code: "AO", name: "Angola", language: "pt" },
  { code: "MZ", name: "Mozambique", language: "pt" },
  { code: "SM", name: "San Marino", language: "it" },
  { code: "CH", name: "Switzerland", language: "en", aliases: ["svizzera", "schweiz"] },
  { code: "FR", name: "France", language: "en" },
  { code: "DE", name: "Germany", language: "en", aliases: ["deutschland"] },
  { code: "PL", name: "Poland", language: "en", aliases: ["polska"] },
  { code: "RS", name: "Serbia", language: "en" },
  { code: "BG", name: "Bulgaria", language: "en" },
  { code: "NL", name: "Netherlands", language: "en" },
  { code: "BE", name: "Belgium", language: "en" },
  { code: "TR", name: "Turkey", language: "en", aliases: ["türkiye", "turkiye"] },
  { code: "GR", name: "Greece", language: "en" },
  { code: "HR", name: "Croatia", language: "en" },
  { code: "SI", name: "Slovenia", language: "en" },
  { code: "CZ", name: "Czech Republic", language: "en", aliases: ["czechia"] },
  { code: "UA", name: "Ukraine", language: "en" },
  { code: "GB", name: "United Kingdom", language: "en", aliases: ["uk", "england"] },
  { code: "IE", name: "Ireland", language: "en" },
  { code: "CA", name: "Canada", language: "en" },
  { code: "US", name: "United States", language: "en", aliases: ["usa"] },
  { code: "AU", name: "Australia", language: "en" },
  { code: "JP", name: "Japan", language: "en" },
  { code: "KR", name: "South Korea", language: "en" },
  { code: "CN", name: "China", language: "en" },
];

export function countryByCode(code: string | null | undefined): Country | undefined {
  if (!code) return undefined;
  return COUNTRIES.find((c) => c.code === code.toUpperCase());
}

/** Accepts an ISO-2 code or a country name/alias and returns the ISO-2 code. */
export function normalizeCountry(input: string | null | undefined): string | null {
  if (!input) return null;
  const v = input.trim().toLowerCase();
  if (!v) return null;
  const hit = COUNTRIES.find(
    (c) => c.code.toLowerCase() === v || c.name.toLowerCase() === v || c.aliases?.includes(v),
  );
  return hit?.code ?? null;
}

export function isSupportedLanguage(v: string | null | undefined): v is Language {
  return !!v && (LANGUAGES as string[]).includes(v);
}

/** Preferred language when known, else the nationality's default, else English. */
export function pickLanguage(preferred: string | null | undefined, nationality: string | null | undefined): Language {
  const p = preferred?.trim().toLowerCase().slice(0, 2);
  if (isSupportedLanguage(p)) return p;
  return countryByCode(nationality)?.language ?? "en";
}
