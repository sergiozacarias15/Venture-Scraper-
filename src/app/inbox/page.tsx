import { attachConversationAction, logReplyAction, reclassifyAction } from "../actions";
import { Flash } from "@/components/flash";
import { Badge, btn, fmtDate, input, PageHeader, StatusBadge, Table } from "@/components/ui";
import { getDb } from "@/lib/db";
import { listConversationsToCheck } from "@/modules/messaging/service";

export const dynamic = "force-dynamic";
const FILTERS = [["check", "To check on Volleybox"], ["all", "All replies"], ["interested", "Interested"], ["question", "Question"], ["not_interested", "Not interested"], ["review", "Needs review"], ["no_response", "No response"]] as const;

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ f?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const f = FILTERS.some(([k]) => k === sp.f) ? sp.f! : "check";
  const db = getDb();
  const here = `/inbox?f=${f}`;
  const counts = (await db.query<{ k: string; n: number }>(`
    select coalesce(category, 'none') k, count(*)::int n from messages where direction='in' group by 1
    union all select 'review', count(*)::int from messages where direction='in' and needs_review
    union all select 'no_response', count(*)::int from conversations where outcome='no_response'`)).reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.k]: r.n }), {});
  counts.all = Object.entries(counts).filter(([k]) => ["interested", "question", "not_interested"].includes(k)).reduce((a, [, n]) => a + n, 0);

  const toCheck = f === "check" ? await listConversationsToCheck(db) : [];
  counts.check = (await db.query<{ n: number }>(
    `select count(*)::int n from conversations c join athletes a on a.id = c.athlete_id
     where c.status = 'active' and c.outcome = 'pending' and c.last_inbound_at is null and a.status = 'contacted'`))[0].n;
  const replies = f === "no_response" || f === "check" ? [] : await db.query<any>(
    `select m.*, a.full_name, a.profile_url, c.conversation_url from messages m
     join athletes a on a.id = m.athlete_id left join conversations c on c.id = m.conversation_id
     where m.direction = 'in' ${f === "all" ? "" : f === "review" ? "and m.needs_review" : "and m.category = $1"}
     order by m.received_at desc limit 100`, f === "all" || f === "review" ? [] : [f]);
  const silent = f === "no_response" ? await db.query<any>(
    `select c.*, a.full_name, a.profile_url from conversations c join athletes a on a.id = c.athlete_id
     where c.outcome = 'no_response' order by c.last_outbound_at desc limit 100`) : [];

  return (
    <>
      <PageHeader title="Inbox" description="Volleybox has no reply feed we may read automatically, so you check each conversation on Volleybox and log what came back. Each reply is categorized automatically; correct it if needed." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mb-3 flex flex-wrap gap-1">
        {FILTERS.map(([k, label]) => (
          <a key={k} href={`/inbox?f=${k}`} className={`rounded-lg border px-3 py-1.5 text-sm ${f === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}>
            {label} <span className="opacity-70">{counts[k] ?? 0}</span>
          </a>
        ))}
      </div>
      {f === "check" ? (
        <Table head={["Athlete", "Waiting since", "Volleybox", "Log a reply"]} empty={toCheck.length ? undefined : "No conversations are waiting for a reply."}>
          {toCheck.map((c) => {
            const hasThread = !!c.thread_id && !c.thread_id.startsWith("manual-");
            return (
              <tr key={c.athlete_id}>
                <td className="w-48 px-3 py-2"><a className="font-medium underline" href={`/athletes/${c.athlete_id}`}>{c.full_name}</a>{c.followups_sent > 0 && <div className="text-xs text-slate-500">{c.followups_sent} follow-up(s) sent</div>}</td>
                <td className="w-40 px-3 py-2 text-xs">{fmtDate(c.last_outbound_at)}</td>
                <td className="w-56 px-3 py-2 text-xs">
                  {hasThread ? (
                    <a className={`${btn.secondary} ${btn.small}`} href={c.conversation_url ?? "#"} target="_blank" rel="noreferrer">Open conversation</a>
                  ) : (
                    <form action={attachConversationAction} className="flex flex-col gap-1">
                      <input type="hidden" name="athleteId" value={c.athlete_id} /><input type="hidden" name="returnTo" value={here} />
                      <input name="conversation" placeholder="paste volleybox.net/pm/inbox/..." aria-label="Volleybox conversation link" className={`${input} !py-1 text-xs`} />
                      <button className={`${btn.secondary} ${btn.small}`}>Save link</button>
                    </form>
                  )}
                  <a className="mt-1 block text-sky-700 underline" href={c.profile_url} target="_blank" rel="noreferrer">Volleybox profile</a>
                </td>
                <td className="px-3 py-2">
                  <form action={logReplyAction} className="flex gap-2">
                    <input type="hidden" name="athleteId" value={c.athlete_id} /><input type="hidden" name="returnTo" value={here} />
                    <textarea name="body" rows={2} placeholder="Paste their reply here" className={`${input} text-xs`} />
                    <button className={`${btn.primary} ${btn.small} self-start`}>Log reply</button>
                  </form>
                </td>
              </tr>
            );
          })}
        </Table>
      ) : f === "no_response" ? (
        <Table head={["Athlete", "Last message sent", "Follow-ups", "Links"]} empty={silent.length ? undefined : "No conversations are marked No Response yet."}>
          {silent.map((c) => (
            <tr key={c.id}>
              <td className="px-3 py-2"><a className="font-medium underline" href={`/athletes/${c.athlete_id}`}>{c.full_name}</a></td>
              <td className="px-3 py-2">{fmtDate(c.last_outbound_at)}</td>
              <td className="px-3 py-2">{c.followups_sent}</td>
              <td className="px-3 py-2"><a className="text-sky-700 underline" href={c.profile_url} target="_blank" rel="noreferrer">Profile</a></td>
            </tr>
          ))}
        </Table>
      ) : (
        <Table head={["Athlete", "Reply", "Category", "Links"]} empty={replies.length ? undefined : "No replies yet."}>
          {replies.map((m) => (
            <tr key={m.id}>
              <td className="w-48 px-3 py-2"><a className="font-medium underline" href={`/athletes/${m.athlete_id}`}>{m.full_name}</a><div className="text-xs text-slate-500">{fmtDate(m.received_at)}</div></td>
              <td className="px-3 py-2"><p className="max-w-xl whitespace-pre-wrap">{m.body}</p></td>
              <td className="w-56 px-3 py-2">
                <div className="mb-1 flex flex-wrap items-center gap-1"><StatusBadge status={m.category} />{m.needs_review && <Badge tone="amber">needs review</Badge>}{m.category_source === "manual" && <Badge>manual</Badge>}</div>
                <form action={reclassifyAction} className="flex gap-1">
                  <input type="hidden" name="id" value={m.id} /><input type="hidden" name="returnTo" value={here} />
                  <select name="category" defaultValue={m.category} className={`${input} !py-1 text-xs`}>
                    <option value="interested">Interested</option><option value="question">Question</option><option value="not_interested">Not interested</option>
                  </select>
                  <button className={`${btn.secondary} ${btn.small}`}>Set</button>
                </form>
              </td>
              <td className="w-40 px-3 py-2 text-xs">
                <a className="block text-sky-700 underline" href={m.profile_url} target="_blank" rel="noreferrer">Volleybox profile</a>
                {m.conversation_url && <a className="block text-sky-700 underline" href={m.conversation_url} target="_blank" rel="noreferrer">Open conversation</a>}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
