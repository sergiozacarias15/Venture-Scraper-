import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "../i18n";

export function LanguageSelector() {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage?.split("-")[0] ?? "en";

  return (
    <label className="relative flex items-center">
      <span className="sr-only">{t("language")}</span>
      <Languages aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-slate-500" />
      <select
        aria-label={t("language")}
        value={current}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
        className="h-10 cursor-pointer appearance-none rounded-full border border-slate-200 bg-white py-0 pr-8 pl-9 text-sm font-semibold text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
      >
        {supportedLanguages.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
