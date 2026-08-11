import { z } from "zod";

const requiredText = (max = 250) => z.string().trim().min(1).max(max);
const optionalText = (max = 2_000) => z.string().trim().max(max);
const email = z.string().trim().email().max(320);
const phone = z
  .string()
  .trim()
  .min(7)
  .max(30)
  .regex(/^\+?[0-9()\s.-]{7,30}$/);
const optionalUrl = z.union([z.literal(""), z.string().trim().url().max(2_000)]);

const answersSchema = z
  .object({
    fullName: requiredText(160),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    nationality: requiredText(100),
    residenceCountry: requiredText(100),
    cityCountry: requiredText(180),
    email,
    whatsapp: phone,
    height: requiredText(40),
    dominantHand: z.enum(["right", "left", "both"]),
    primaryPosition: z.enum(["setter", "outside", "opposite", "middle", "libero", "defensive"]),
    secondaryPosition: z.union([
      z.literal(""),
      z.enum(["setter", "outside", "opposite", "middle", "libero", "defensive"]),
    ]),
    currentClub: requiredText(180),
    currentCategory: requiredText(120),
    experienceYears: z
      .string()
      .regex(/^\d{1,2}$/)
      .refine((value) => Number(value) <= 40),
    highestLevel: requiredText(250),
    representativeExperience: optionalText(),
    achievements: optionalText(),
    coachName: requiredText(160),
    coachContact: requiredText(250),
    schoolName: requiredText(200),
    academicAverage: requiredText(80),
    graduationYear: z.string().regex(/^\d{4}$/),
    englishLevel: z.enum(["beginner", "elementary", "intermediate", "upperIntermediate", "advanced", "native"]),
    intendedMajor: requiredText(200),
    highlightVideo: optionalUrl,
    fullMatchVideo: optionalUrl,
    profileLink: optionalUrl,
    startYear: z.string().regex(/^\d{4}$/),
    annualBudget: z.enum(["under10", "10to20", "20to30", "30to40", "over40", "unsure"]),
    mainGoal: z.enum(["scholarship", "academic", "professional", "experience", "other"]),
    concern: requiredText(2_000),
    marketingSource: z.enum(["instagram", "whatsapp", "friend", "coach", "search", "event", "other"]),
    guardianName: optionalText(160),
    guardianEmail: z.union([z.literal(""), email]),
    guardianWhatsapp: z.union([z.literal(""), phone]),
    guardianConsent: z.boolean(),
    privacyConsent: z.literal(true),
    contactConsent: z.literal(true),
  })
  .strict()
  .superRefine((answers, context) => {
    const birthDate = new Date(`${answers.birthDate}T00:00:00Z`);
    const today = new Date();
    if (
      Number.isNaN(birthDate.getTime()) ||
      birthDate.toISOString().slice(0, 10) !== answers.birthDate ||
      birthDate > today
    ) {
      context.addIssue({ code: "custom", path: ["birthDate"], message: "Invalid birth date" });
      return;
    }

    let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
    const month = today.getUTCMonth() - birthDate.getUTCMonth();
    if (month < 0 || (month === 0 && today.getUTCDate() < birthDate.getUTCDate())) age -= 1;
    if (age > 100) context.addIssue({ code: "custom", path: ["birthDate"], message: "Invalid birth date" });

    const currentYear = today.getUTCFullYear();
    const graduationYear = Number(answers.graduationYear);
    if (graduationYear < currentYear - 2 || graduationYear > currentYear + 10) {
      context.addIssue({ code: "custom", path: ["graduationYear"], message: "Invalid graduation year" });
    }
    const startYear = Number(answers.startYear);
    if (startYear < currentYear || startYear > currentYear + 10) {
      context.addIssue({ code: "custom", path: ["startYear"], message: "Invalid start year" });
    }

    if (age < 18) {
      if (!answers.guardianName) {
        context.addIssue({ code: "custom", path: ["guardianName"], message: "Guardian name is required" });
      }
      if (!answers.guardianEmail) {
        context.addIssue({ code: "custom", path: ["guardianEmail"], message: "Guardian email is required" });
      }
      if (!answers.guardianWhatsapp) {
        context.addIssue({
          code: "custom",
          path: ["guardianWhatsapp"],
          message: "Guardian WhatsApp is required",
        });
      }
      if (!answers.guardianConsent) {
        context.addIssue({
          code: "custom",
          path: ["guardianConsent"],
          message: "Guardian consent is required",
        });
      }
    }
  });

export const assessmentRequestSchema = z
  .object({
    answers: answersSchema,
    context: z
      .object({
        language: z.enum(["en", "it", "es", "pt", "fr", "de"]),
        sourceRoute: z.literal("/sergiozacarias"),
        formStartedAt: z.number().int().positive(),
        clientSubmissionId: z.string().uuid(),
        website: z.literal(""),
      })
      .strict(),
  })
  .strict();

export type AssessmentRequest = z.infer<typeof assessmentRequestSchema>;
export type AssessmentAnswers = AssessmentRequest["answers"];
