import { z } from "zod";
import type { DiscoveredAthlete, DiscoveryAdapter, DiscoveryCriteria, DiscoveryPage } from "../types";

const responseSchema = z.object({
  data: z.array(
    z.object({
      id: z.union([z.string(), z.number()]).optional(),
      url: z.string(),
      name: z.string(),
      birth_year: z.number().nullish(),
      birth_date: z.string().nullish(),
      gender: z.string().nullish(),
      nationality: z.string().nullish(),
      position: z.string().nullish(),
      club: z.string().nullish(),
      club_country: z.string().nullish(),
      height_cm: z.number().nullish(),
      instagram: z.string().nullish(),
      language: z.string().nullish(),
    }),
  ),
  next_cursor: z.string().nullish(),
});

export class DiscoveryApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

/**
 * Adapter for an authorized Volleybox data-partner API. The endpoint shape below is an
 * assumption: align `buildQuery` and `responseSchema` with the contract in your agreement.
 * It only issues authenticated, rate-limit-respecting requests; HTTP 429 aborts the run.
 */
export class HttpDiscoveryAdapter implements DiscoveryAdapter {
  id = "volleybox-api";
  live = true;
  constructor(
    private baseUrl = process.env.VOLLEYBOX_API_BASE_URL!,
    private apiKey = process.env.VOLLEYBOX_API_KEY!,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private buildQuery(c: DiscoveryCriteria, cursor: string | null, limit: number) {
    const q = new URLSearchParams({ limit: String(limit) });
    if (c.birthYears.length) q.set("birth_year", c.birthYears.join(","));
    if (c.genders.length) q.set("gender", c.genders.join(","));
    if (c.countries.length) q.set("nationality", c.countries.join(","));
    if (c.positions.length) q.set("position", c.positions.join(","));
    if (cursor) q.set("cursor", cursor);
    return q.toString();
  }

  async search(criteria: DiscoveryCriteria, cursor: string | null, limit: number): Promise<DiscoveryPage> {
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/athletes?${this.buildQuery(criteria, cursor, limit)}`, {
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" },
    });
    if (!res.ok) throw new DiscoveryApiError(`Volleybox API responded ${res.status}`, res.status);
    const parsed = responseSchema.parse(await res.json());
    const athletes: DiscoveredAthlete[] = parsed.data.map((r) => ({
      profileUrl: r.url,
      volleyboxId: r.id != null ? String(r.id) : null,
      fullName: r.name,
      birthYear: r.birth_year ?? null,
      birthDate: r.birth_date ?? null,
      gender: r.gender ?? null,
      nationality: r.nationality ?? null,
      position: r.position ?? null,
      club: r.club ?? null,
      clubCountry: r.club_country ?? null,
      heightCm: r.height_cm ?? null,
      instagram: r.instagram ?? null,
      preferredLanguage: r.language ?? null,
      raw: r as Record<string, unknown>,
    }));
    return { athletes, nextCursor: parsed.next_cursor ?? null };
  }
}
