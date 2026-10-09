import { resumeSendingAction, saveOutreachSettings } from "../actions";
import { Flash } from "@/components/flash";
import { ModeBanner } from "@/components/mode-banner";
import { btn, Card, CheckGroup, Field, input, PageHeader } from "@/components/ui";
import { LANGUAGE_LABEL, LANGUAGES } from "@/lib/countries";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { renderMessage } from "@/modules/messaging/templates";

export const dynamic = "force-dynamic";
const DAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"]] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings(getDb());
  const num = (name: string, label: string, value: number, hint?: string, min = 0) => (
    <Field label={label} hint={hint}><input name={name} type="number" min={min} defaultValue={value} className={input} /></Field>
  );
  const sample = (language: (typeof LANGUAGES)[number], minor: boolean) =>
    renderMessage({ language, kind: "intro", minor, firstName: "Giulia", senderName: s.sender_name || "Your Name", org: s.sender_org, club: "Modena VC" });

  return (
    <>
      <PageHeader title="Settings" description="Sending schedule, limits and safeguards. Limits are applied to every send, including automatic ones." />
      <Flash ok={sp.ok} error={sp.error} />
      <ModeBanner settings={s} returnTo="/settings" />
      <form action={saveOutreachSettings} className="space-y-5">
        <Card title="Sender">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Your name" hint="Required: used to sign every message."><input name="sender_name" defaultValue={s.sender_name} className={input} placeholder="e.g. Sam Carter" /></Field>
            <Field label="Organization"><input name="sender_org" defaultValue={s.sender_org} className={input} /></Field>
          </div>
        </Card>
        <Card title="Automation">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="outreach_enabled" defaultChecked={s.outreach_enabled} /> <strong>Send automatically</strong> (approved messages go out on the schedule below)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="auto_approve_adults" defaultChecked={s.auto_approve_adults} /> Auto-approve drafts for athletes confirmed to be 18+ (minors always need your approval)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="followups_enabled" defaultChecked={s.followups_enabled} /> Send a polite follow-up if there is no reply (stops as soon as the athlete replies or declines)</label>
          </div>
        </Card>
        <Card title="Schedule and limits">
          <div className="grid gap-4 md:grid-cols-4">
            {num("daily_cap", "Max messages per rolling 24h", s.daily_cap)}
            {num("min_interval_seconds", "Min seconds between messages", s.min_interval_seconds)}
            {num("window_start_hour", "Window starts (hour, 0-23)", s.window_start_hour)}
            {num("window_end_hour", "Window ends (hour, 1-24)", s.window_end_hour, undefined, 1)}
            <Field label="Timezone"><input name="timezone" defaultValue={s.timezone} className={input} /></Field>
            {num("plan_backlog_cap", "Max drafts waiting at once", s.plan_backlog_cap)}
            <div className="md:col-span-2"><Field label="Sending days"><CheckGroup name="send_days" options={DAYS.map(([v, l]) => ({ value: v, label: l }))} selected={s.send_days} /></Field></div>
          </div>
          <p className="mt-3 text-xs text-slate-500">If Volleybox returns a rate limit, CAPTCHA, or account restriction, sending pauses automatically and you are alerted. The app never tries to work around it.</p>
        </Card>
        <Card title="Follow-ups and safeguards">
          <div className="grid gap-4 md:grid-cols-4">
            {num("followup_delay_days", "Follow-up after (days)", s.followup_delay_days, undefined, 1)}
            {num("max_followups", "Max follow-ups", s.max_followups)}
            {num("no_response_after_days", "Mark No Response after (days)", s.no_response_after_days, undefined, 1)}
            {num("min_contact_age", "Minimum contact age", s.min_contact_age, "Athletes who cannot be this old are excluded.", 13)}
          </div>
        </Card>
        <button className={btn.primary}>Save settings</button>
      </form>

      <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Message templates (preview)</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {LANGUAGES.map((l) => (
          <Card key={l} title={LANGUAGE_LABEL[l]}>
            <p className="text-sm whitespace-pre-wrap">{sample(l, false)}</p>
            <p className="mt-3 border-t border-slate-100 pt-3 text-xs font-medium text-slate-500">If the athlete may be under 18</p>
            <p className="text-sm whitespace-pre-wrap text-slate-700">{sample(l, true)}</p>
          </Card>
        ))}
      </div>
      {s.sending_paused_until && s.sending_paused_until > new Date() && (
        <form action={resumeSendingAction} className="mt-6"><button className={btn.secondary}>Resume sending</button></form>
      )}
    </>
  );
}
