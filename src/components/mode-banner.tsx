import { resumeSendingAction } from "@/app/actions";
import { getVolleyboxMode } from "@/lib/env";
import type { Settings } from "@/lib/settings";
import { btn, Notice } from "./ui";

export function ModeBanner({ settings, returnTo = "/" }: { settings?: Settings; returnTo?: string }) {
  const mode = getVolleyboxMode().mode;
  const paused = settings?.sending_paused_until && settings.sending_paused_until > new Date();
  return (
    <>
      {mode === "demo" ? (
        <Notice tone="amber"><strong>Demo mode.</strong> Athletes are synthetic and sends are fake. Nothing real is stored or contacted.</Notice>
      ) : (
        <Notice tone="blue">
          <strong>Assisted mode.</strong> Volleybox has no public API, so athletes are imported and you send each approved message yourself on Volleybox, then confirm it here. <a className="underline" href="/integrations">Details</a>
        </Notice>
      )}
      {paused && (
        <Notice tone="red">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span><strong>Sending is paused:</strong> {settings!.sending_paused_reason}. Resolve it on Volleybox before resuming.</span>
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
