import { useEffect } from "react";
import { ArrowLeft, CheckCircle2, ShieldCheck, UserRound } from "lucide-react";
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
    <div className="min-h-screen bg-[#F3F3F3]">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-6xl items-center justify-between px-4 sm:h-20 sm:px-6">
          <Link to="/sergiozacarias" aria-label={t("brand")} className="shrink-0">
            <img
              src="/brand/venture-official-logo.png"
              alt={t("brand")}
              className="h-9 w-auto object-contain sm:h-11"
            />
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
        <section className="relative overflow-hidden bg-[#150A56] pb-14 text-white sm:pb-18">
          <div className="absolute inset-0 [background-image:radial-gradient(circle_at_10%_20%,rgba(252,236,98,0.18)_0,transparent_25%),radial-gradient(circle_at_70%_100%,rgba(255,188,125,0.12)_0,transparent_34%),linear-gradient(120deg,#150A56_0%,#21156B_54%,#0C120F_100%)]" />
          <div className="volleyball-grid absolute inset-y-0 right-0 w-3/5 opacity-20" />
          <div className="absolute -top-28 -left-24 size-80 rounded-full border border-white/10" />
          <div className="absolute -top-16 -left-12 size-56 rounded-full border border-white/8" />
          <div className="absolute -right-28 -bottom-40 size-96 rounded-full border-[48px] border-white/5" />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_450px] lg:items-center lg:gap-14 lg:py-20">
            <div className="max-w-2xl">
              <p className="mb-4 text-xs font-bold tracking-[0.18em] text-[#FCEC62] uppercase">{t("hero.eyebrow")}</p>
              <h1 className="font-display text-5xl leading-[0.95] font-bold tracking-wide uppercase sm:text-6xl lg:text-7xl">
                {t("hero.title")}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">{t("hero.description")}</p>
              <p className="mt-6 flex items-center gap-2 text-sm font-medium text-slate-300">
                <ShieldCheck aria-hidden="true" className="size-5 text-[#FCEC62]" />
                {t("hero.trust")}
              </p>
            </div>
            <div className="relative mx-auto w-full max-w-[450px]">
              <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] border border-white/15 bg-[#0C120F] shadow-2xl shadow-black/30 sm:rounded-[2rem]">
                <img
                  src="/media/volleyball-hero-action.webp"
                  alt=""
                  aria-hidden="true"
                  fetchPriority="high"
                  className="h-full w-full object-cover object-center"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#150A56]/85 via-[#150A56]/10 to-black/5" />
                <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />
              </div>
              <div className="relative mx-3 -mt-14 rounded-2xl border border-white/70 bg-white/95 p-4 text-[#0C120F] shadow-xl shadow-black/20 backdrop-blur sm:mx-5 sm:p-5">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-[#150A56] text-[#FCEC62] ring-4 ring-[#FCEC62]/25 sm:size-14">
                    <UserRound aria-hidden="true" className="size-6 sm:size-7" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-[#150A56]">{t("advisor.name")}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-600 sm:text-sm">{t("advisor.role")}</p>
                    <p className="mt-0.5 text-[11px] font-bold tracking-wider text-[#150A56]/65 uppercase">{t("advisor.company")}</p>
                  </div>
                  <img
                    src="/brand/venture-sports-usa-mark.png"
                    alt=""
                    aria-hidden="true"
                    className="hidden size-11 shrink-0 object-contain sm:block"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="absolute right-0 bottom-0 left-0 h-12 bg-gradient-to-b from-transparent to-[#F3F3F3]" />
        </section>

        <section className="relative z-10 mx-auto -mt-6 max-w-4xl px-4 pb-10 sm:-mt-9 sm:px-6 sm:pb-14">
          <div className="rounded-2xl border border-[#150A56]/10 bg-white p-5 shadow-2xl shadow-[#150A56]/10 sm:rounded-3xl sm:p-8 lg:p-10">
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
          <span className="mx-auto grid size-20 place-items-center rounded-full bg-[#FCEC62]/30 text-[#150A56]">
            <CheckCircle2 aria-hidden="true" className="size-11" />
          </span>
          <p className="mt-7 text-xs font-bold tracking-[0.18em] text-[#150A56] uppercase">{t("confirmation.eyebrow")}</p>
          <h1 className="font-display mt-3 text-4xl font-bold tracking-wide text-[#150A56] uppercase sm:text-5xl">
            {t("confirmation.title", { name: state?.name ?? "" })}
          </h1>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-slate-600">{t("confirmation.message")}</p>
          {state?.reference && (
            <p className="mt-5 text-sm font-semibold text-slate-700">
              {t("confirmation.reference")}: <span className="text-[#150A56]">{state.reference}</span>
            </p>
          )}
          <div className="mx-auto mt-9 max-w-xl rounded-2xl bg-[#F3F3F3] p-5 text-left sm:p-6">
            <h2 className="font-display text-2xl font-semibold tracking-wide text-[#150A56] uppercase">{t("confirmation.next")}</h2>
            <ol className="mt-4 grid gap-4 text-sm leading-relaxed text-slate-600">
              {[1, 2, 3].map((number) => (
                <li key={number} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#150A56] text-xs font-bold text-[#FCEC62]">{number}</span>
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
          <h1 className="font-display text-4xl font-bold tracking-wide text-[#150A56] uppercase">{t("privacy.title")}</h1>
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
