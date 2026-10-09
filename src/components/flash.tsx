import { Notice } from "./ui";

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  return (
    <>
      {ok && <Notice tone="green">{ok}</Notice>}
      {error && <Notice tone="red">{error}</Notice>}
    </>
  );
}
