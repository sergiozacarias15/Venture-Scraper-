import { getDb } from "@/lib/db";
import { getVolleyboxMode } from "@/lib/env";
import { logoutAction } from "@/app/actions";

const LINKS = [
  ["/", "Dashboard"],
  ["/discovery", "Discovery"],
  ["/athletes", "Athletes"],
  ["/outreach", "Outreach queue"],
  ["/inbox", "Inbox"],
  ["/leads", "Leads"],
  ["/suppressions", "Suppression list"],
  ["/integrations", "Integrations"],
  ["/settings", "Settings"],
  ["/logs", "Logs & jobs"],
] as const;

async function unreadAlerts() {
  try {
    const [row] = await getDb().query<{ n: number }>("select count(*)::int n from alerts where read_at is null");
    return row.n;
  } catch {
    return 0;
  }
}

export async function Nav() {
  const mode = getVolleyboxMode();
  const unread = await unreadAlerts();
  return (
    <aside className="border-b border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:w-56 lg:border-b-0 lg:border-r">
      <div className="px-4 py-4">
        <div className="text-sm font-semibold">Venture Sports USA</div>
        <div className="text-xs text-slate-500">Volleybox outreach</div>
        <div className={`mt-2 inline-block rounded px-2 py-0.5 text-xs font-medium ${mode.mode === "live" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          {mode.mode === "live" ? "Live integration" : "Mock mode"}
        </div>
      </div>
      <nav className="flex flex-wrap gap-1 px-2 pb-3 lg:flex-col">
        {LINKS.map(([href, label]) => (
          <a key={href} href={href} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
            {label}
            {href === "/" && unread > 0 && <span className="rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">{unread}</span>}
          </a>
        ))}
      </nav>
      <form action={logoutAction} className="px-4 pb-4">
        <button className="text-xs text-slate-500 underline">Sign out</button>
      </form>
    </aside>
  );
}
