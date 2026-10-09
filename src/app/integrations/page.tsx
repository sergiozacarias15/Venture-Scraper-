import { Badge, Card, Notice, PageHeader, Table } from "@/components/ui";
import { getVolleyboxMode } from "@/lib/env";
import { AUTOMATION_REQUIREMENTS, capabilities } from "@/lib/integrations";

export const dynamic = "force-dynamic";
const TONE = { working: "green", assisted: "blue", demo: "amber", unavailable: "gray" } as const;
const LABEL = { working: "Working", assisted: "Assisted (manual step)", demo: "Demo only", unavailable: "Unavailable" } as const;

export default function IntegrationsPage() {
  const mode = getVolleyboxMode().mode;
  return (
    <>
      <PageHeader title="Integrations" description="What works, what needs your hands, and what is not possible today." />
      {mode === "assisted" ? (
        <Notice tone="blue"><strong>Assisted mode.</strong> Volleybox offers no public API, partner program or data licence that we could find, so nothing is automated against Volleybox. You import athletes and send each approved message yourself in Volleybox, then confirm it here.</Notice>
      ) : (
        <Notice tone="amber"><strong>Demo mode.</strong> Synthetic athletes and fake sends. Switch VOLLEYBOX_MODE off (or to assisted) for real work.</Notice>
      )}
      <Table head={["Capability", "Status", "Details"]}>
        {capabilities().map((c) => (
          <tr key={c.name}>
            <td className="px-3 py-2 font-medium">{c.name}</td>
            <td className="px-3 py-2"><Badge tone={TONE[c.state]}>{LABEL[c.state]}</Badge></td>
            <td className="px-3 py-2 text-slate-600">{c.detail}</td>
          </tr>
        ))}
      </Table>
      <Card title="What would be required to automate any of this" className="mt-8">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
          {AUTOMATION_REQUIREMENTS.map((r) => <li key={r}>{r}</li>)}
        </ol>
      </Card>
    </>
  );
}
