import { guardianConsentAction, moveChannelAction } from "../actions";
import { Flash } from "@/components/flash";
import { Badge, btn, fmtDate, input, PageHeader, StatusBadge, Table } from "@/components/ui";
import { getDb } from "@/lib/db";
import { isPotentialMinor } from "@/modules/messaging/safeguards";

export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const rows = await getDb().query<any>(
    `select l.*, a.full_name, a.profile_url, a.birth_year, a.birth_date, a.nationality, a.position, a.club, a.instagram,
       c.conversation_url,
       (select body from messages m where m.athlete_id = a.id and m.direction = 'in' order by m.received_at desc limit 1) as last_reply
     from leads l join athletes a on a.id = l.athlete_id
     left join conversations c on c.athlete_id = a.id
     order by (l.status = 'new') desc, l.created_at desc limit 200`);

  return (
    <>
      <PageHeader title="Interested leads" description="Athletes who responded positively. Continue the conversation personally; automated messages to them have stopped. Lead records carry Pipedrive sync fields for the future integration." />
      <Flash ok={sp.ok} error={sp.error} />
      <Table head={["Athlete", "Last reply", "Lead status", "Continue", "Pipedrive"]} empty={rows.length ? undefined : "No interested leads yet."}>
        {rows.map((l) => {
          const minor = isPotentialMinor(l);
          return (
            <tr key={l.id}>
              <td className="w-56 px-3 py-2">
                <a className="font-medium underline" href={`/athletes/${l.athlete_id}`}>{l.full_name}</a>
                <div className="text-xs text-slate-500">{[l.birth_year, l.nationality, l.position, l.club].filter(Boolean).join(" - ")}</div>
                {minor && <Badge tone="amber">potential minor</Badge>}
                <div className="mt-1 flex gap-2 text-xs">
                  <a className="text-sky-700 underline" href={l.profile_url} target="_blank" rel="noreferrer">Profile</a>
                  {l.conversation_url && <a className="text-sky-700 underline" href={l.conversation_url} target="_blank" rel="noreferrer">Conversation</a>}
                  {l.instagram && <a className="text-sky-700 underline" href={`https://instagram.com/${l.instagram}`} target="_blank" rel="noreferrer">@{l.instagram}</a>}
                </div>
              </td>
              <td className="px-3 py-2"><p className="max-w-md whitespace-pre-wrap text-slate-700">{l.last_reply}</p></td>
              <td className="px-3 py-2"><StatusBadge status={l.status} />{l.off_platform_channel && <div className="mt-1 text-xs text-slate-500">{l.off_platform_channel} {fmtDate(l.moved_at)}</div>}</td>
              <td className="w-64 px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {["whatsapp", "instagram"].map((c) => (
                    <form action={moveChannelAction} key={c}>
                      <input type="hidden" name="athleteId" value={l.athlete_id} /><input type="hidden" name="channel" value={c} /><input type="hidden" name="returnTo" value="/leads" />
                      <button className={`${btn.secondary} ${btn.small}`}>Moved to {c === "whatsapp" ? "WhatsApp" : "Instagram"}</button>
                    </form>
                  ))}
                </div>
                {minor && (l.guardian_consent_at ? <p className="mt-1 text-xs text-emerald-700">Guardian involved</p> : (
                  <form action={guardianConsentAction} className="mt-2 flex gap-1">
                    <input type="hidden" name="athleteId" value={l.athlete_id} /><input type="hidden" name="returnTo" value="/leads" />
                    <input name="note" required placeholder="Guardian involvement" className={`${input} !py-1 text-xs`} />
                    <button className={`${btn.secondary} ${btn.small}`}>Record</button>
                  </form>
                ))}
              </td>
              <td className="px-3 py-2 text-xs text-slate-500">{l.pipedrive_sync_status.replace("_", " ")}</td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
