import { getVolleyboxMode } from "@/lib/env";
import { Notice } from "./ui";
import { resumeSendingAction } from "@/app/actions";
import { btn } from "./ui";
import type { Settings } from "@/lib/settings";

export function ModeBanner({ settings, returnTo = "/" }: { settings?: Settings; returnTo?: string }) {
  const mode = getVolleyboxMode();
  const paused = settings?.sending_paused_until && settings.sending_paused_until > new Date();
  return (
    <>
      {mode.mode === "mock" && (
        <Notice tone="amber">
          <strong>Live sending is unavailable.</strong> The mock adapters are active, so discovery uses synthetic athletes and
          nothing is delivered to Volleybox. {mode.reason}
        </Notice>
      )}
      {paused && (
        <Notice tone="red">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span><strong>Sending is paused:</strong> {settings!.sending_paused_reason}. Resolve it in Volleybox before resuming.</span>
            <form action={resumeSendingAction}>
              <input type="hidden" name="returnTo" value={returnTo} />
              <button className={`${btn.secondary} ${btn.small}`}>Resume sending</button>
            </form>
          </div>
        </Notice>
      )}
    </>
  );
}
