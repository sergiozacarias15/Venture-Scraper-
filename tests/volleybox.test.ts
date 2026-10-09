import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { updateSettings } from "@/lib/settings";
import { normalizePosition } from "@/modules/discovery/normalize";
import { importRankingPass, setPassStatus, syncPasses } from "@/modules/discovery/passes";
import { attachConversation, confirmManualSend, listConversationsToCheck, planIntros } from "@/modules/messaging/service";
import { suppressProfileUrl } from "@/modules/messaging/suppression";
import { ingestInbound } from "@/modules/responses/service";
import { describePass, parseConversationRef, parseRankingLines, rankingPasses, SURFACES } from "@/modules/volleybox/interfaces";
import { createTestDb, seedAthlete } from "./helpers/db";

const NOW = new Date("2026-10-09T15:00:00Z");
const isPos = (t: string) => normalizePosition(t) !== null;
let db: Db;
const one = async <T = any>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p))[0];

beforeEach(async () => {
  db = await createTestDb();
  await updateSettings(db, {
    sender_name: "Sam Carter", auto_approve_adults: true, min_interval_seconds: 0, daily_cap: 10,
    criteria_birth_years: [2007, 2008], criteria_countries: ["IT", "BR"], criteria_genders: ["female"], criteria_positions: [],
  });
});

describe("Volleybox surface registry", () => {
  it("never claims automation is authorized or tested", () => {
    expect(SURFACES.map((s) => s.id)).toEqual(["ranking", "pm_inbox"]);
    for (const s of SURFACES) expect(s).toMatchObject({ automation: "not_authorized", tested: false });
  });

  it("parses conversation links and ids, and rejects everything else", () => {
    const url = "https://volleybox.net/pm/inbox/abc123";
    expect(parseConversationRef(url)).toEqual({ id: "abc123", url });
    expect(parseConversationRef("https://www.volleybox.net/pm/inbox/abc123/?x=1#m")).toEqual({ id: "abc123", url });
    expect(parseConversationRef(" abc123 ")).toEqual({ id: "abc123", url });
    expect(parseConversationRef("")).toBeNull();
    expect(parseConversationRef("http://volleybox.net/pm/inbox/abc123")).toBeNull();
    expect(parseConversationRef("https://evil.example/pm/inbox/abc123")).toBeNull();
    expect(parseConversationRef("https://volleybox.net/pm/inbox")).toBeNull();
    expect(parseConversationRef("https://volleybox.net/player/abc123")).toBeNull();
  });

  it("builds one pass per gender x country x birth year", () => {
    const passes = rankingPasses({ birthYears: [2008, 2007], genders: ["female", "male"], countries: ["IT"], positions: [] });
    expect(passes).toHaveLength(4);
    expect(describePass(passes[0])).toBe("Women - born 2007 - Italy");
  });

  it("parses pasted ranking lines and reports what it cannot read", () => {
    const { rows, errors } = parseRankingLines(
      [
        "https://volleybox.net/example-a-p1 | Anna Example | Setter",
        "Bea Sample\thttps://volleybox.net/example-b-p2\t12",
        "no link here",
        "https://volleybox.net/example-c-p3",
        "",
      ].join("\n"),
      isPos,
    );
    expect(rows).toEqual([
      { name: "Anna Example", profileUrl: "https://volleybox.net/example-a-p1", position: "Setter" },
      { name: "Bea Sample", profileUrl: "https://volleybox.net/example-b-p2", position: null },
    ]);
    expect(errors).toHaveLength(2);
  });
});

describe("ranking passes", () => {
  it("creates passes from the criteria and is idempotent", async () => {
    const first = await syncPasses(db);
    expect(first).toHaveLength(4);
    expect(await syncPasses(db)).toHaveLength(4);
    await updateSettings(db, { criteria_countries: ["IT"] });
    expect(await syncPasses(db)).toHaveLength(2);
    await setPassStatus(db, first[0].id, "done");
    expect((await one("select status from discovery_passes where id=$1", [first[0].id])).status).toBe("done");
  });

  it("imports reviewed players with operator-asserted fields, dedupes and honours suppression", async () => {
    const pass = (await syncPasses(db)).find((p) => p.country === "IT" && p.birth_year === 2008)!;
    await suppressProfileUrl(db, "https://volleybox.net/example-b-p2", "manual");
    const text = [
      "https://volleybox.net/example-a-p1 | Anna Example | Setter",
      "https://volleybox.net/example-b-p2 | Bea Sample",
      "https://volleybox.net/example-c-p3 | Cleo Test",
      "garbage line",
    ].join("\n");
    const r = await importRankingPass(db, pass.id, { text, position: "Libero" });
    expect(r).toMatchObject({ inserted: 2, skippedSuppressed: 1 });
    expect(r.errors).toHaveLength(1);
    const anna = await one("select * from athletes where profile_url='https://volleybox.net/example-a-p1'");
    expect(anna).toMatchObject({ birth_year: 2008, nationality: "IT", gender: "female", position: "Setter", source: "ranking_pass" });
    expect(anna.raw.operatorAsserted).toContain("birth_year");
    expect((await one("select position from athletes where full_name='Cleo Test'")).position).toBe("Libero");

    const again = await importRankingPass(db, pass.id, { text });
    expect(again.inserted).toBe(0);
    expect(again.duplicates).toBe(2);
    expect(await one("select imported, duplicates from discovery_passes where id=$1", [pass.id])).toMatchObject({ imported: 2, duplicates: 2 });
  });

  it("rejects an empty paste and does not import outside the criteria", async () => {
    const pass = (await syncPasses(db))[0];
    await expect(importRankingPass(db, pass.id, { text: "nothing useful" })).rejects.toThrow(/no profile link/);
    await updateSettings(db, { criteria_birth_years: [2010] });
    const r = await importRankingPass(db, pass.id, { text: "https://volleybox.net/example-z-p9 | Zoe Test" });
    expect(r).toMatchObject({ inserted: 0, skippedCriteria: 1 });
  });
});

describe("conversation links", () => {
  async function ready() {
    const id = await seedAthlete(db);
    await planIntros(db, NOW);
    const m = await one<{ id: string }>("select id from messages where athlete_id=$1", [id]);
    return { id, messageId: m.id };
  }

  it("stores the /pm/inbox link on confirm and routes replies by it", async () => {
    const { id, messageId } = await ready();
    await confirmManualSend(db, messageId, NOW, "https://volleybox.net/pm/inbox/conv42");
    expect(await one("select thread_id, conversation_url, adapter from conversations where athlete_id=$1", [id])).toEqual({
      thread_id: "conv42", conversation_url: "https://volleybox.net/pm/inbox/conv42", adapter: "assisted",
    });
    const r = await ingestInbound(db, "assisted", { externalId: "r1", threadId: "conv42", body: "Yes, I am interested", receivedAt: NOW });
    expect(r).toMatchObject({ status: "stored", category: "interested" });
  });

  it("rejects a malformed link without sending, and a link already used by another athlete", async () => {
    const a = await ready();
    const b = await ready();
    await expect(confirmManualSend(db, a.messageId, NOW, "https://example.com/pm/inbox/x")).rejects.toThrow(/not a Volleybox conversation link/);
    expect((await one("select status from messages where id=$1", [a.messageId])).status).toBe("approved");
    await confirmManualSend(db, a.messageId, NOW, "conv1");
    await expect(confirmManualSend(db, b.messageId, NOW, "conv1")).rejects.toThrow(/already attached/);
    expect((await one("select status from messages where id=$1", [b.messageId])).status).toBe("approved");
  });

  it("can attach a link later, and lists conversations awaiting a reply", async () => {
    const { id, messageId } = await ready();
    await confirmManualSend(db, messageId, NOW);
    expect(await one("select thread_id from conversations where athlete_id=$1", [id])).toEqual({ thread_id: `manual-${id}` });
    expect(await listConversationsToCheck(db)).toHaveLength(1);
    await attachConversation(db, id, "https://volleybox.net/pm/inbox/late9");
    expect((await listConversationsToCheck(db))[0]).toMatchObject({ thread_id: "late9", conversation_url: "https://volleybox.net/pm/inbox/late9" });
    await ingestInbound(db, "assisted", { externalId: "r2", threadId: "late9", body: "No gracias", receivedAt: NOW });
    expect(await listConversationsToCheck(db)).toHaveLength(0);
  });
});
