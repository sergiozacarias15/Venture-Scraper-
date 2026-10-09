import { loginAction } from "@/app/actions";
import { btn, input } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const configured = !!process.env.ADMIN_PASSWORD;
  return (
    <div className="mx-auto mt-24 max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold">Sign in</h1>
      {!configured && (
        <p className="mt-2 text-sm text-amber-800">ADMIN_PASSWORD is not set on the server. Set it in the environment to enable sign-in.</p>
      )}
      {error && <p className="mt-2 text-sm text-red-700">Incorrect password.</p>}
      <form action={loginAction} className="mt-4 space-y-3">
        <input type="hidden" name="next" value={next ?? "/"} />
        <input type="password" name="password" placeholder="Password" className={input} autoFocus required />
        <button className={`${btn.primary} w-full`}>Sign in</button>
      </form>
    </div>
  );
}
