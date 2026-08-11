import { useEffect } from "react";
import { ArrowLeft, CheckCircle2, ShieldCheck, Volleyball } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AssessmentForm } from "./components/AssessmentForm";
import { LanguageSelector } from "./components/LanguageSelector";
import { Button } from "./components/ui/button";

function PageChrome({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage?.split("-")[0] ?? "en";
  }, [i18n.resolvedLanguage]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/sergiozacarias" className="flex items-center gap-2.5 text-slate-950">
            <span className="grid size-9 place-items-center rounded-xl bg-slate-950 text-cyan-300">
              <Volleyball aria-hidden="true" className="size-5" />
            </span>
            <span className="text-sm font-extrabold tracking-tight sm:text-base">{t("brand")}</span>
          </Link>
          <LanguageSelector />
        </div>
      </header>
      {children}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-center text-xs text-slate-500 sm:flex-row sm:px-6">
          <span>{t("footer.copyright", { year: new Date().getFullYear() })}</span>
          <Link to="/privacy" className="font-medium hover:text-slate-900">{t("privacy.link")}</Link>
        </div>
      </footer>
    </div>
  );
}

function AssessmentPage() {
  const { t } = useTranslation();

  return (
    <PageChrome>
      <main>
        <section className="relative overflow-hidden bg-slate-950 text-white">
          <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_20%,#22d3ee_0,transparent_28%),radial-gradient(circle_at_85%_70%,#2563eb_0,transparent_32%)]" />
          <div className="absolute -right-28 -bottom-40 size-96 rounded-full border-[48px] border-white/5" />
          <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1fr_340px] lg:items-center lg:py-20">
            <div className="max-w-3xl">
              <p className="mb-4 text-xs font-bold tracking-[0.18em] text-cyan-300 uppercase">{t("hero.eyebrow")}</p>
              <h1 className="text-4xl leading-[1.05] font-black tracking-tight sm:text-5xl lg:text-6xl">
                {t("hero.title")}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">{t("hero.description")}</p>
              <p className="mt-6 flex items-center gap-2 text-sm font-medium text-slate-300">
                <ShieldCheck aria-hidden="true" className="size-5 text-cyan-300" />
                {t("hero.trust")}
              </p>
            </div>
            <div className="hidden rounded-3xl border border-white/10 bg-white/5 p-7 backdrop-blur lg:block">
              <div className="grid size-16 place-items-center rounded-2xl bg-cyan-300 text-slate-950">
                <Volleyball aria-hidden="true" className="size-9" />
              </div>
              <div className="mt-8 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-2/3 rounded-full bg-cyan-300" />
              </div>
              <p className="mt-4 text-sm leading-relaxed font-semibold text-slate-200">{t("hero.agent")}</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/50 sm:rounded-3xl sm:p-8 lg:p-10">
            <p className="mb-6 text-xs text-slate-500">{t("common.requiredHint")}</p>
            <AssessmentForm />
          </div>
        </section>
      </main>
    </PageChrome>
  );
}

function ConfirmationPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const state = location.state as { name?: string; reference?: string } | null;

  return (
    <PageChrome>
      <main className="mx-auto flex max-w-3xl items-center px-4 py-16 sm:px-6 sm:py-24">
        <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-xl shadow-slate-200/60 sm:p-12">
          <span className="mx-auto grid size-20 place-items-center rounded-full bg-cyan-100 text-cyan-700">
            <CheckCircle2 aria-hidden="true" className="size-11" />
          </span>
          <p className="mt-7 text-xs font-bold tracking-[0.18em] text-cyan-700 uppercase">{t("confirmation.eyebrow")}</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            {t("confirmation.title", { name: state?.name ?? "" })}
          </h1>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-slate-600">{t("confirmation.message")}</p>
          {state?.reference && (
            <p className="mt-5 text-sm font-semibold text-slate-700">
              {t("confirmation.reference")}: <span className="text-cyan-700">{state.reference}</span>
            </p>
          )}
          <div className="mx-auto mt-9 max-w-xl rounded-2xl bg-slate-50 p-5 text-left sm:p-6">
            <h2 className="font-bold text-slate-950">{t("confirmation.next")}</h2>
            <ol className="mt-4 grid gap-4 text-sm leading-relaxed text-slate-600">
              {[1, 2, 3].map((number) => (
                <li key={number} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-950 text-xs font-bold text-cyan-300">{number}</span>
                  {t(`confirmation.step${number}`)}
                </li>
              ))}
            </ol>
          </div>
          <Button asChild className="mt-8">
            <Link to="/sergiozacarias">{t("confirmation.return")}</Link>
          </Button>
        </div>
      </main>
    </PageChrome>
  );
}

function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <PageChrome>
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 sm:p-10">
          <h1 className="text-3xl font-black tracking-tight text-slate-950">{t("privacy.title")}</h1>
          <p className="mt-5 leading-8 text-slate-600">{t("privacy.body")}</p>
          <Button asChild variant="outline" className="mt-8">
            <Link to="/sergiozacarias">
              <ArrowLeft aria-hidden="true" className="size-4" />
              {t("privacy.back")}
            </Link>
          </Button>
        </article>
      </main>
    </PageChrome>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/sergiozacarias" replace />} />
      <Route path="/sergiozacarias" element={<AssessmentPage />} />
      <Route path="/sergiozacarias/confirmation" element={<ConfirmationPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="*" element={<Navigate to="/sergiozacarias" replace />} />
    </Routes>
  );
}
