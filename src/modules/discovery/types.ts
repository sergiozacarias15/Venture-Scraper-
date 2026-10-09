export type DiscoveryCriteria = {
  birthYears: number[];
  genders: string[];
  countries: string[];
  positions: string[];
};

export type DiscoveredAthlete = {
  profileUrl: string;
  volleyboxId?: string | null;
  fullName: string;
  birthYear?: number | null;
  birthDate?: string | null;
  gender?: string | null;
  nationality?: string | null;
  position?: string | null;
  club?: string | null;
  clubCountry?: string | null;
  heightCm?: number | null;
  instagram?: string | null;
  preferredLanguage?: string | null;
  raw?: Record<string, unknown>;
};

export type DiscoveryPage = { athletes: DiscoveredAthlete[]; nextCursor: string | null };

/** A source of athlete profiles that the operator is authorized to use. */
export interface DiscoveryAdapter {
  id: string;
  /** false for mock/offline sources; nothing real is contacted. */
  live: boolean;
  search(criteria: DiscoveryCriteria, cursor: string | null, limit: number): Promise<DiscoveryPage>;
}
