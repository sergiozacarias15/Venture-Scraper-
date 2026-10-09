import { Badge, Card, Notice, PageHeader, Table } from "@/components/ui";
import { getVolleyboxMode } from "@/lib/env";
import { capabilities, liveActivationChecklist } from "@/lib/integrations";

export const dynamic = "force-dynamic";
const TONE = { working: "green", mock: "amber", not_connected: "gray" } as const;
const LABEL = { working: "Working", mock: "Mock only", not_connected: "Not connected" } as const;

export default function IntegrationsPage() {
  const mode = getVolleyboxMode();
  const checks = liveActivationChecklist();
  return (
    <>
      <PageHeader title="Integrations" description="What works today, what is mocked, and exactly what is required to go live with Volleybox." />
      {mode.mode === "mock" ? (
        <Notice tone="amber"><strong>Live Volleybox access is not active.</strong> {mode.reason} Discovery returns synthetic athletes and &quot;sent&quot; messages are only recorded locally.</Notice>
      ) : (
        <Notice tone="green"><strong>Live mode is active.</strong> Messages are sent through the configured Volleybox integration within your limits.</Notice>
      )}

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Capabilities</h2>
      <Table head={["Capability", "Status", "Details"]}>
        {capabilities().map((c) => (
          <tr key={c.name}>
            <td className="px-3 py-2 font-medium">{c.name}</td>
            <td className="px-3 py-2"><Badge tone={TONE[c.state]}>{LABEL[c.state]}</Badge></td>
            <td className="px-3 py-2 text-slate-600">{c.detail}</td>
          </tr>
        ))}
      </Table>

      <Card title="Checklist to activate live discovery and messaging" className="mt-8">
        <ol className="space-y-3 text-sm">
          {checks.map((c, i) => (
            <li key={c.key} className="flex gap-3">
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${c.ok ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>{c.ok ? "✓" : i + 1}</span>
              <div>
                <div className="font-medium">{c.label} {!c.required && <span className="font-normal text-slate-500">(optional)</span>}</div>
                <div className="text-slate-600">{c.how}</div>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-slate-500">Items without a tick that the app cannot verify (authorization, API contract, limits) must be confirmed by you.</p>
      </Card>
    </>
  );
}
