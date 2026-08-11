import { z } from "zod";

type Translate = (key: string) => string;

const optionalUrl = (t: Translate) =>
  z
    .string()
    .trim()
    .refine((value) => !value || /^https?:\/\/.+/i.test(value), t("validation.url"));

export function getAge(birthDate: string) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDifference = today.getMonth() - birth.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

export const createAssessmentSchema = (t: Translate) => {
  const required = z.string().trim().min(1, t("validation.required"));
  const email = z.string().trim().min(1, t("validation.required")).email(t("validation.email"));
  const phone = z
    .string()
    .trim()
    .min(1, t("validation.required"))
    .regex(/^\+?[0-9()\s.-]{7,24}$/, t("validation.phone"));

  return z
    .object({
      fullName: required,
      birthDate: required
        .refine((value) => getAge(value) !== null, t("validation.birthDate"))
        .refine((value) => new Date(`${value}T00:00:00`) <= new Date(), t("validation.futureDate")),
      nationality: required,
      residenceCountry: required,
      cityCountry: required,
      email,
      whatsapp: phone,
      height: required,
      dominantHand: required,
      primaryPosition: required,
      secondaryPosition: z.string(),
      currentClub: required,
      currentCategory: required,
      experienceYears: required,
      highestLevel: required,
      representativeExperience: z.string(),
      achievements: z.string(),
      coachName: required,
      coachContact: required,
      schoolName: required,
      academicAverage: required,
      graduationYear: required,
      englishLevel: required,
      intendedMajor: required,
      highlightVideo: optionalUrl(t),
      fullMatchVideo: optionalUrl(t),
      profileLink: optionalUrl(t),
      startYear: required,
      annualBudget: required,
      mainGoal: required,
      concern: required,
      marketingSource: required,
      guardianName: z.string(),
      guardianEmail: z.string(),
      guardianWhatsapp: z.string(),
      guardianConsent: z.boolean(),
      privacyConsent: z.boolean().refine(Boolean, t("validation.consent")),
      contactConsent: z.boolean().refine(Boolean, t("validation.consent")),
    })
    .superRefine((data, context) => {
      const age = getAge(data.birthDate);
      if (age !== null && age < 18) {
        if (!data.guardianName.trim()) {
          context.addIssue({ code: "custom", path: ["guardianName"], message: t("validation.guardian") });
        }
        if (!z.string().email().safeParse(data.guardianEmail).success) {
          context.addIssue({ code: "custom", path: ["guardianEmail"], message: t("validation.email") });
        }
        if (!/^\+?[0-9()\s.-]{7,24}$/.test(data.guardianWhatsapp.trim())) {
          context.addIssue({ code: "custom", path: ["guardianWhatsapp"], message: t("validation.phone") });
        }
        if (!data.guardianConsent) {
          context.addIssue({ code: "custom", path: ["guardianConsent"], message: t("validation.consent") });
        }
      }
    });
};

export type AssessmentValues = z.infer<ReturnType<typeof createAssessmentSchema>>;

export interface AssessmentSubmissionRequest {
  answers: AssessmentValues;
  context: {
    language: string;
    sourceRoute: string;
    formStartedAt: number;
    clientSubmissionId: string;
    website: string;
  };
}

export const defaultValues: AssessmentValues = {
  fullName: "",
  birthDate: "",
  nationality: "",
  residenceCountry: "",
  cityCountry: "",
  email: "",
  whatsapp: "",
  height: "",
  dominantHand: "",
  primaryPosition: "",
  secondaryPosition: "",
  currentClub: "",
  currentCategory: "",
  experienceYears: "",
  highestLevel: "",
  representativeExperience: "",
  achievements: "",
  coachName: "",
  coachContact: "",
  schoolName: "",
  academicAverage: "",
  graduationYear: "",
  englishLevel: "",
  intendedMajor: "",
  highlightVideo: "",
  fullMatchVideo: "",
  profileLink: "",
  startYear: "",
  annualBudget: "",
  mainGoal: "",
  concern: "",
  marketingSource: "",
  guardianName: "",
  guardianEmail: "",
  guardianWhatsapp: "",
  guardianConsent: false,
  privacyConsent: false,
  contactConsent: false,
};
