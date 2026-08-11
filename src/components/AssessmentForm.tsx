import { useEffect, useMemo, useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleUserRound,
  GraduationCap,
  LoaderCircle,
  LockKeyhole,
  Target,
  Volleyball,
} from "lucide-react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  createAssessmentSchema,
  defaultValues,
  getAge,
  type AssessmentSubmissionRequest,
  type AssessmentValues,
} from "../lib/assessment";
import { SubmissionError, submitAssessment } from "../lib/submission";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { Textarea } from "./ui/textarea";

const stepFields: FieldPath<AssessmentValues>[][] = [
  ["fullName", "birthDate", "nationality", "residenceCountry", "cityCountry", "email", "whatsapp"],
  [
    "height",
    "dominantHand",
    "primaryPosition",
    "secondaryPosition",
    "currentClub",
    "currentCategory",
    "experienceYears",
    "highestLevel",
    "representativeExperience",
    "achievements",
    "coachName",
    "coachContact",
  ],
  [
    "schoolName",
    "academicAverage",
    "graduationYear",
    "englishLevel",
    "intendedMajor",
    "highlightVideo",
    "fullMatchVideo",
    "profileLink",
  ],
  [
    "startYear",
    "annualBudget",
    "mainGoal",
    "concern",
    "marketingSource",
    "guardianName",
    "guardianEmail",
    "guardianWhatsapp",
    "guardianConsent",
    "privacyConsent",
    "contactConsent",
  ],
];

const positionValues = ["setter", "outside", "opposite", "middle", "libero", "defensive"];
const englishValues = ["beginner", "elementary", "intermediate", "upperIntermediate", "advanced", "native"];
const budgetValues = ["under10", "10to20", "20to30", "30to40", "over40", "unsure"];
const goalValues = ["scholarship", "academic", "professional", "experience", "other"];
const sourceValues = ["instagram", "whatsapp", "friend", "coach", "search", "event", "other"];
const DRAFT_STORAGE_KEY = "venture-volleyball-assessment-draft";
const stepMeta = [
  { key: "athlete", icon: CircleUserRound },
  { key: "volleyball", icon: Volleyball },
  { key: "academics", icon: GraduationCap },
  { key: "goals", icon: Target },
];

function Field({
  label,
  error,
  optional,
  help,
  children,
}: {
  label: string;
  error?: string;
  optional?: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-800">
      <span>
        {label} {!optional && <span className="text-[#150A56]">*</span>}
        {optional && <span className="ml-1 font-normal text-slate-400">({optional})</span>}
      </span>
      {children}
      {help && <span className="text-xs leading-relaxed font-normal text-slate-500">{help}</span>}
      {error && (
        <span role="alert" className="text-xs font-medium text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="form-step-enter relative overflow-hidden rounded-2xl border border-[#150A56]/10 bg-gradient-to-br from-white via-white to-[#F3F3F3]/65 p-5 shadow-sm sm:p-7">
      <div className="absolute top-0 left-0 h-1 w-20 rounded-br-full bg-[#FCEC62]" />
      <div className="mb-7 border-b border-[#150A56]/10 pb-5">
        <h2 className="font-display text-3xl font-semibold tracking-wide text-[#150A56] uppercase sm:text-4xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">{description}</p>
      </div>
      {children}
    </section>
  );
}

function CheckboxField({
  label,
  error,
  registration,
}: {
  label: ReactNode;
  error?: string;
  registration: ReturnType<ReturnType<typeof useForm<AssessmentValues>>["register"]>;
}) {
  return (
    <label className="block">
      <span
        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm leading-relaxed transition ${
          error ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"
        }`}
      >
        <input
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 accent-[#150A56]"
          {...registration}
        />
        <span className="text-slate-700">{label}</span>
      </span>
      {error && (
        <span role="alert" className="mt-1.5 block text-xs font-medium text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

export function AssessmentForm() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const schema = useMemo(() => createAssessmentSchema(t), [t]);
  const initialValues = useMemo(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) ?? "{}") as Partial<AssessmentValues>;
      return { ...defaultValues, ...saved };
    } catch {
      return defaultValues;
    }
  }, []);
  const [formStartedAt] = useState(() => Date.now());
  const [clientSubmissionId] = useState(() => crypto.randomUUID());
  const [website, setWebsite] = useState("");
  const {
    register,
    handleSubmit,
    control,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<AssessmentValues>({
    resolver: zodResolver(schema),
    defaultValues: initialValues,
    mode: "onTouched",
  });

  const draftValues = useWatch({ control });
  const birthDate = useWatch({ control, name: "birthDate" });
  const age = getAge(birthDate);
  const isMinor = age !== null && age < 18;
  const optional = t("common.optional");
  const ActiveStepIcon = stepMeta[step].icon;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftValues));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [draftValues]);

  const nextStep = async () => {
    const valid = await trigger(stepFields[step], { shouldFocus: true });
    if (!valid) {
      toast.error(t("notifications.stepError"));
      return;
    }
    setStep((value) => Math.min(value + 1, 3));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const previousStep = () => {
    setStep((value) => Math.max(value - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onSubmit = async (values: AssessmentValues) => {
    const language = i18n.resolvedLanguage?.split("-")[0] ?? "en";
    const payload: AssessmentSubmissionRequest = {
      answers: values,
      context: {
        language,
        sourceRoute: window.location.pathname,
        formStartedAt,
        clientSubmissionId,
        website,
      },
    };

    try {
      const result = await submitAssessment(payload);
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      toast.success(t("notifications.saved"));
      navigate("/sergiozacarias/confirmation", {
        state: { name: values.fullName.split(" ")[0], reference: result.id },
      });
    } catch (error) {
      const code = error instanceof SubmissionError ? error.code : "submission_failed";
      const messageKey =
        code === "duplicate"
          ? "notifications.duplicate"
          : code === "rate_limited"
            ? "notifications.rateLimited"
            : code === "invalid_submission"
              ? "notifications.invalidSubmission"
              : "notifications.error";
      toast.error(t(messageKey));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <input
        type="text"
        name="website"
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="pointer-events-none absolute -left-[9999px] size-px opacity-0"
      />
      <div className="mb-8" aria-label={t("progress.label", { current: step + 1, total: 4 })}>
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-bold tracking-wide text-[#150A56] uppercase">
            <span className="grid size-8 place-items-center rounded-lg bg-[#FCEC62]/55">
              <ActiveStepIcon aria-hidden="true" className="size-4" />
            </span>
            {t("progress.label", { current: step + 1, total: 4 })}
          </span>
          <span className="text-xs font-semibold text-slate-500">{t(`progress.${stepMeta[step].key}`)}</span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={4}
          aria-valuenow={step + 1}
          className="h-2 overflow-hidden rounded-full bg-slate-100"
        >
          <div
            className="h-full rounded-full bg-[#150A56] transition-all duration-500"
            style={{ width: `${((step + 1) / 4) * 100}%` }}
          />
        </div>
        <div className="mt-4 hidden grid-cols-4 gap-2 sm:grid">
          {stepMeta.map(({ key, icon: StepIcon }, index) => (
            <div
              key={key}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
                index === step
                  ? "border-[#150A56]/20 bg-[#FCEC62]/20 text-[#150A56]"
                  : index < step
                    ? "border-[#150A56]/10 bg-[#150A56]/5 text-[#150A56]"
                    : "border-slate-200 bg-white text-slate-400"
              }`}
            >
              <StepIcon aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate text-xs font-semibold">{t(`progress.${key}`)}</span>
            </div>
          ))}
        </div>
      </div>
      {step === 0 && (
        <FormSection title={t("sections.athleteTitle")} description={t("sections.athleteDescription")}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("fields.fullName")} error={errors.fullName?.message}>
              <Input autoComplete="name" {...register("fullName")} />
            </Field>
            <Field label={t("fields.birthDate")} error={errors.birthDate?.message}>
              <Input type="date" max={new Date().toISOString().slice(0, 10)} {...register("birthDate")} />
            </Field>
            <Field label={t("fields.nationality")} error={errors.nationality?.message}>
              <Input autoComplete="country-name" {...register("nationality")} />
            </Field>
            <Field label={t("fields.residenceCountry")} error={errors.residenceCountry?.message}>
              <Input autoComplete="country-name" {...register("residenceCountry")} />
            </Field>
            <Field label={t("fields.cityCountry")} error={errors.cityCountry?.message}>
              <Input autoComplete="address-level2" {...register("cityCountry")} />
            </Field>
            <Field label={t("fields.email")} error={errors.email?.message}>
              <Input type="email" inputMode="email" autoComplete="email" {...register("email")} />
            </Field>
            <Field label={t("fields.whatsapp")} error={errors.whatsapp?.message}>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder={t("fields.whatsappPlaceholder")}
                {...register("whatsapp")}
              />
            </Field>
          </div>
        </FormSection>
      )}

      {step === 1 && (
        <FormSection title={t("sections.volleyballTitle")} description={t("sections.volleyballDescription")}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("fields.height")} error={errors.height?.message}>
              <Input placeholder={t("fields.heightPlaceholder")} {...register("height")} />
            </Field>
            <Field label={t("fields.dominantHand")} error={errors.dominantHand?.message}>
              <Select {...register("dominantHand")}>
                <option value="">{t("common.select")}</option>
                {["right", "left", "both"].map((value) => (
                  <option key={value} value={value}>{t(`options.hand.${value}`)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("fields.primaryPosition")} error={errors.primaryPosition?.message}>
              <Select {...register("primaryPosition")}>
                <option value="">{t("common.select")}</option>
                {positionValues.map((value) => (
                  <option key={value} value={value}>{t(`options.position.${value}`)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("fields.secondaryPosition")} optional={optional} error={errors.secondaryPosition?.message}>
              <Select {...register("secondaryPosition")}>
                <option value="">{t("common.notApplicable")}</option>
                {positionValues.map((value) => (
                  <option key={value} value={value}>{t(`options.position.${value}`)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("fields.currentClub")} error={errors.currentClub?.message}>
              <Input {...register("currentClub")} />
            </Field>
            <Field label={t("fields.currentCategory")} error={errors.currentCategory?.message}>
              <Input {...register("currentCategory")} />
            </Field>
            <Field label={t("fields.experienceYears")} error={errors.experienceYears?.message}>
              <Input type="number" min="0" max="40" inputMode="numeric" {...register("experienceYears")} />
            </Field>
            <Field label={t("fields.highestLevel")} error={errors.highestLevel?.message}>
              <Input {...register("highestLevel")} />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label={t("fields.representativeExperience")}
                optional={optional}
                error={errors.representativeExperience?.message}
              >
                <Textarea placeholder={t("fields.representativePlaceholder")} {...register("representativeExperience")} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label={t("fields.achievements")} optional={optional} error={errors.achievements?.message}>
                <Textarea placeholder={t("fields.achievementsPlaceholder")} {...register("achievements")} />
              </Field>
            </div>
            <Field label={t("fields.coachName")} error={errors.coachName?.message}>
              <Input {...register("coachName")} />
            </Field>
            <Field label={t("fields.coachContact")} error={errors.coachContact?.message}>
              <Input placeholder={t("fields.coachContactPlaceholder")} {...register("coachContact")} />
            </Field>
          </div>
        </FormSection>
      )}

      {step === 2 && (
        <FormSection title={t("sections.academicsTitle")} description={t("sections.academicsDescription")}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("fields.schoolName")} error={errors.schoolName?.message}>
              <Input {...register("schoolName")} />
            </Field>
            <Field label={t("fields.academicAverage")} error={errors.academicAverage?.message}>
              <Input placeholder={t("fields.academicAveragePlaceholder")} {...register("academicAverage")} />
            </Field>
            <Field label={t("fields.graduationYear")} error={errors.graduationYear?.message}>
              <Input
                type="number"
                min={new Date().getFullYear() - 2}
                max={new Date().getFullYear() + 10}
                inputMode="numeric"
                {...register("graduationYear")}
              />
            </Field>
            <Field label={t("fields.englishLevel")} error={errors.englishLevel?.message}>
              <Select {...register("englishLevel")}>
                <option value="">{t("common.select")}</option>
                {englishValues.map((value) => (
                  <option key={value} value={value}>{t(`options.english.${value}`)}</option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("fields.intendedMajor")} error={errors.intendedMajor?.message}>
                <Input {...register("intendedMajor")} />
              </Field>
            </div>
            <Field label={t("fields.highlightVideo")} optional={optional} error={errors.highlightVideo?.message}>
              <Input type="url" inputMode="url" placeholder="https://" {...register("highlightVideo")} />
            </Field>
            <Field label={t("fields.fullMatchVideo")} optional={optional} error={errors.fullMatchVideo?.message}>
              <Input type="url" inputMode="url" placeholder="https://" {...register("fullMatchVideo")} />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("fields.profileLink")} optional={optional} error={errors.profileLink?.message}>
                <Input type="url" inputMode="url" placeholder="https://" {...register("profileLink")} />
              </Field>
            </div>
          </div>
        </FormSection>
      )}

      {step === 3 && (
        <FormSection title={t("sections.goalsTitle")} description={t("sections.goalsDescription")}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("fields.startYear")} error={errors.startYear?.message}>
              <Input
                type="number"
                min={new Date().getFullYear()}
                max={new Date().getFullYear() + 10}
                inputMode="numeric"
                {...register("startYear")}
              />
            </Field>
            <Field
              label={t("fields.annualBudget")}
              help={t("fields.annualBudgetHelp")}
              error={errors.annualBudget?.message}
            >
              <Select {...register("annualBudget")}>
                <option value="">{t("common.select")}</option>
                {budgetValues.map((value) => (
                  <option key={value} value={value}>{t(`options.budget.${value}`)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("fields.mainGoal")} error={errors.mainGoal?.message}>
              <Select {...register("mainGoal")}>
                <option value="">{t("common.select")}</option>
                {goalValues.map((value) => (
                  <option key={value} value={value}>{t(`options.goal.${value}`)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("fields.marketingSource")} error={errors.marketingSource?.message}>
              <Select {...register("marketingSource")}>
                <option value="">{t("common.select")}</option>
                {sourceValues.map((value) => (
                  <option key={value} value={value}>{t(`options.source.${value}`)}</option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("fields.concern")} error={errors.concern?.message}>
                <Textarea {...register("concern")} />
              </Field>
            </div>
          </div>

          {isMinor && (
            <div className="mt-8 rounded-2xl border border-[#150A56]/20 bg-[#FCEC62]/15 p-5 sm:p-6">
              <h3 className="font-display text-2xl font-semibold tracking-wide text-[#150A56] uppercase">{t("sections.guardianTitle")}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{t("sections.guardianDescription")}</p>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <Field label={t("fields.guardianName")} error={errors.guardianName?.message}>
                  <Input autoComplete="name" {...register("guardianName")} />
                </Field>
                <Field label={t("fields.guardianEmail")} error={errors.guardianEmail?.message}>
                  <Input type="email" inputMode="email" autoComplete="email" {...register("guardianEmail")} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label={t("fields.guardianWhatsapp")} error={errors.guardianWhatsapp?.message}>
                    <Input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder={t("fields.whatsappPlaceholder")}
                      {...register("guardianWhatsapp")}
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <CheckboxField
                    label={t("fields.guardianConsent")}
                    error={errors.guardianConsent?.message}
                    registration={register("guardianConsent")}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="mt-8">
            <h3 className="font-display mb-4 text-2xl font-semibold tracking-wide text-[#150A56] uppercase">{t("sections.consentTitle")}</h3>
            <div className="grid gap-3">
              <CheckboxField
                label={
                  <>
                    {t("fields.privacyConsent")}{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      className="font-semibold text-[#150A56] underline underline-offset-2 hover:text-[#0C120F]"
                    >
                      {t("privacy.link")}
                    </a>
                  </>
                }
                error={errors.privacyConsent?.message}
                registration={register("privacyConsent")}
              />
              <CheckboxField
                label={t("fields.contactConsent")}
                error={errors.contactConsent?.message}
                registration={register("contactConsent")}
              />
            </div>
          </div>
        </FormSection>
      )}

      <div className="mt-9 flex items-center justify-between gap-3 border-t border-slate-200 pt-6">
        {step > 0 ? (
          <Button type="button" variant="outline" onClick={previousStep}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            {t("common.back")}
          </Button>
        ) : (
          <span />
        )}
        {step < 3 ? (
          <Button type="button" onClick={() => void nextStep()}>
            {t("common.continue")}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        ) : (
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? (
              <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
            ) : (
              <Check aria-hidden="true" className="size-5" />
            )}
            {isSubmitting ? t("common.submitting") : t("common.submit")}
          </Button>
        )}
      </div>
      <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-slate-500">
        <LockKeyhole aria-hidden="true" className="size-3.5" />
        {t("footer.secure")}
      </p>
    </form>
  );
}
