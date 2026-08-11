import type { AssessmentAnswers } from "./assessment-schema";

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const displayValue = (value: unknown) => {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === "") return "Not provided";
  return escapeHtml(value);
};

const linkValue = (value: string) => {
  if (!value) return "Not provided";
  const safe = escapeHtml(value);
  return `<a href="${safe}" rel="noopener noreferrer">${safe}</a>`;
};

const row = (label: string, value: unknown) =>
  `<tr><td style="padding:5px 12px 5px 0;vertical-align:top"><strong>${escapeHtml(label)}</strong></td><td style="padding:5px 0">${displayValue(value)}</td></tr>`;

const linkRow = (label: string, value: string) =>
  `<tr><td style="padding:5px 12px 5px 0;vertical-align:top"><strong>${escapeHtml(label)}</strong></td><td style="padding:5px 0">${linkValue(value)}</td></tr>`;

const section = (title: string, rows: string[]) =>
  `<h3>${escapeHtml(title)}</h3><table>${rows.join("")}</table>`;

export function buildAssessmentNote(
  answers: AssessmentAnswers,
  language: string,
  submittedAt: string,
  clientSubmissionId: string,
) {
  return [
    "<h2>College Volleyball Application</h2>",
    section("Athlete and contact", [
      row("Full name", answers.fullName),
      row("Date of birth", answers.birthDate),
      row("Nationality", answers.nationality),
      row("Country of residence", answers.residenceCountry),
      row("City and country", answers.cityCountry),
      row("Email", answers.email),
      row("WhatsApp", answers.whatsapp),
    ]),
    section("Volleyball profile", [
      row("Height", answers.height),
      row("Dominant hand", answers.dominantHand),
      row("Primary position", answers.primaryPosition),
      row("Secondary position", answers.secondaryPosition),
      row("Current club", answers.currentClub),
      row("Current league/category", answers.currentCategory),
      row("Years of experience", answers.experienceYears),
      row("Highest level reached", answers.highestLevel),
      row("Regional/national experience", answers.representativeExperience),
      row("Awards and achievements", answers.achievements),
      row("Coach name", answers.coachName),
      row("Coach contact", answers.coachContact),
    ]),
    section("Academic profile", [
      row("School name", answers.schoolName),
      row("Academic average/GPA", answers.academicAverage),
      row("Graduation year", answers.graduationYear),
      row("English level", answers.englishLevel),
      row("Intended major", answers.intendedMajor),
    ]),
    section("Videos and profile", [
      linkRow("Highlight video", answers.highlightVideo),
      linkRow("Full-match video", answers.fullMatchVideo),
      linkRow("Instagram/player profile", answers.profileLink),
    ]),
    section("U.S. plans", [
      row("Preferred start year", answers.startYear),
      row("Approximate annual family budget", answers.annualBudget),
      row("Main goal", answers.mainGoal),
      row("Biggest recruiting concern", answers.concern),
      row("Marketing source", answers.marketingSource),
    ]),
    section("Parent or guardian", [
      row("Name", answers.guardianName),
      row("Email", answers.guardianEmail),
      row("WhatsApp", answers.guardianWhatsapp),
      row("Guardian consent", answers.guardianConsent),
    ]),
    section("Consent and submission record", [
      row("Privacy/GDPR consent", answers.privacyConsent),
      row("Contact consent", answers.contactConsent),
      row("Selected language", language),
      row("Submission date (UTC)", submittedAt),
      row("Sport", "Volleyball"),
      row("Recruiting advisor/deal owner", "Sergio Zacarias"),
      row("Submission reference", clientSubmissionId),
    ]),
  ].join("");
}
