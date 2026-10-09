import { COUNTRIES } from "@/lib/countries";
import { POSITIONS } from "../normalize";
import type { DiscoveredAthlete, DiscoveryAdapter, DiscoveryCriteria, DiscoveryPage } from "../types";

const NAMES: Record<string, { first: { female: string[]; male: string[] }; last: string[]; cities: string[] }> = {
  IT: { first: { female: ["Giulia", "Sofia", "Chiara", "Martina", "Alice"], male: ["Matteo", "Luca", "Marco", "Andrea", "Davide"] }, last: ["Rossi", "Bianchi", "Conti", "Greco", "Ferri"], cities: ["Modena", "Perugia", "Bergamo", "Novara"] },
  ES: { first: { female: ["Lucía", "Paula", "Marta", "Carmen", "Nuria"], male: ["Pablo", "Álvaro", "Hugo", "Diego", "Sergio"] }, last: ["García", "Martín", "López", "Ruiz", "Navarro"], cities: ["Valencia", "Madrid", "Murcia", "Sevilla"] },
  PT: { first: { female: ["Inês", "Beatriz", "Matilde", "Leonor", "Rita"], male: ["João", "Tiago", "Rafael", "Miguel", "Diogo"] }, last: ["Silva", "Santos", "Ferreira", "Costa", "Pereira"], cities: ["Lisboa", "Porto", "Braga", "Espinho"] },
  BR: { first: { female: ["Ana", "Júlia", "Larissa", "Camila", "Bianca"], male: ["Gabriel", "Lucas", "Pedro", "Thiago", "Bruno"] }, last: ["Oliveira", "Souza", "Lima", "Almeida", "Carvalho"], cities: ["Rio", "Minas", "Osasco", "Curitiba"] },
};
const FALLBACK = { first: { female: ["Emma", "Mia", "Nina", "Lena", "Anna"], male: ["Max", "Leo", "Noah", "Jan", "Adam"] }, last: ["Novak", "Meyer", "Kovac", "Jensen", "Petit"], cities: ["Capital", "North", "Harbor", "Central"] };

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function build(country: string, year: number, gender: "female" | "male", i: number): DiscoveredAthlete {
  const pool = NAMES[country] ?? FALLBACK;
  const h = hash(`${country}-${year}-${gender}-${i}`);
  const first = pool.first[gender][h % 5];
  const last = pool.last[(h >> 3) % 5];
  const id = `${country}-${year}-${gender[0]}-${i}`.toLowerCase();
  const club = `${pool.cities[(h >> 5) % pool.cities.length]} Volley Club`;
  const lang = COUNTRIES.find((c) => c.code === country)?.language ?? "en";
  return {
    profileUrl: `https://mock.volleybox.test/player/${id}`,
    volleyboxId: `mock-${id}`,
    fullName: `${first} ${last}`,
    birthYear: year,
    gender,
    nationality: country,
    position: POSITIONS[h % POSITIONS.length],
    club,
    clubCountry: country,
    heightCm: 165 + (h % 30),
    preferredLanguage: i % 3 === 0 ? lang : null,
    raw: { mock: true },
  };
}

/**
 * Deterministic, offline discovery source. Produces clearly fake athletes on a
 * reserved `.test` domain so nothing here can be mistaken for real people.
 */
export class MockDiscoveryAdapter implements DiscoveryAdapter {
  id = "mock";
  live = false;
  constructor(private poolPerCombination = Number(process.env.MOCK_POOL_SIZE ?? 8)) {}

  async search(criteria: DiscoveryCriteria, cursor: string | null, limit: number): Promise<DiscoveryPage> {
    const all: DiscoveredAthlete[] = [];
    for (const country of criteria.countries) {
      for (const year of criteria.birthYears) {
        for (const gender of criteria.genders as ("female" | "male")[]) {
          for (let i = 0; i < this.poolPerCombination; i++) all.push(build(country, year, gender, i));
        }
      }
    }
    const filtered = criteria.positions.length ? all.filter((a) => a.position && criteria.positions.includes(a.position)) : all;
    const offset = cursor ? Number(cursor) : 0;
    const page = filtered.slice(offset, offset + limit);
    const next = offset + limit < filtered.length ? String(offset + limit) : null;
    return { athletes: page, nextCursor: next };
  }
}
