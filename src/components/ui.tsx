import type { ReactNode } from "react";

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p>}
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title && <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: string; href?: string }) {
  const inner = (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
  return href ? <a href={href}>{inner}</a> : inner;
}

const TONES: Record<string, string> = {
  gray: "bg-slate-100 text-slate-700",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-sky-100 text-sky-800",
  violet: "bg-violet-100 text-violet-800",
};

const STATUS_TONE: Record<string, string> = {
  discovered: "gray", queued: "blue", contacted: "blue", replied: "violet", interested: "green",
  not_interested: "red", suppressed: "red", unreachable: "amber", excluded: "amber",
  pending_approval: "amber", approved: "blue", sending: "blue", sent: "green", failed: "red", cancelled: "gray", received: "violet",
  question: "violet", no_response: "gray", pending: "gray", succeeded: "green", running: "blue", dead: "red",
  new: "green", in_conversation: "blue", moved_whatsapp: "violet", moved_instagram: "violet", qualified: "green", closed_won: "green", closed_lost: "gray",
  info: "gray", warn: "amber", error: "red", debug: "gray",
};

export function Badge({ children, tone }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone ?? "gray"]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "gray"}>{status.replace(/_/g, " ")}</Badge>;
}

export const btn = {
  primary: "inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50",
  secondary: "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50",
  danger: "inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50",
  small: "px-2 py-1 text-xs",
};

export const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function CheckGroup({ name, options, selected }: { name: string; options: { value: string | number; label: string }[]; selected: (string | number)[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name={name} value={o.value} defaultChecked={selected.map(String).includes(String(o.value))} className="rounded border-slate-300" />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 align-top">{children}</tbody>
      </table>
      {empty && <div className="px-3 py-6 text-center text-sm text-slate-500">{empty}</div>}
    </div>
  );
}

export function Notice({ tone, children }: { tone: "amber" | "red" | "green" | "blue"; children: ReactNode }) {
  const t = { amber: "border-amber-300 bg-amber-50 text-amber-900", red: "border-red-300 bg-red-50 text-red-900", green: "border-emerald-300 bg-emerald-50 text-emerald-900", blue: "border-sky-300 bg-sky-50 text-sky-900" }[tone];
  return <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${t}`}>{children}</div>;
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}
