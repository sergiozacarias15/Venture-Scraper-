import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supportedLanguages } from "../i18n";

export function LanguageSelector() {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage?.split("-")[0] ?? "en";

  return (
    <label className="relative flex items-center">
      <span className="sr-only">{t("language")}</span>
      <Languages aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-[#150A56]" />
      <select
        aria-label={t("language")}
        value={current}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
        className="h-10 cursor-pointer appearance-none rounded-full border border-[#150A56]/20 bg-white py-0 pr-8 pl-9 text-sm font-semibold text-[#150A56] shadow-sm outline-none transition hover:border-[#150A56]/50 focus:border-[#150A56] focus:ring-4 focus:ring-[#150A56]/10"
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
