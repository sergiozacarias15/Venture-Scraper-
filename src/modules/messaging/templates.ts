import type { Language } from "@/lib/countries";

export type TemplateKind = "intro" | "followup";
export type TemplateParams = {
  language: Language;
  kind: TemplateKind;
  minor: boolean;
  firstName: string;
  senderName: string;
  org: string;
  position?: string | null;
  club?: string | null;
};

export const MAX_MESSAGE_LENGTH = 700;

type Copy = {
  club: (club: string) => string;
  intro: (p: P) => string;
  introMinor: (p: P) => string;
  followup: (p: P) => string;
  followupMinor: (p: P) => string;
};
type P = { first: string; sender: string; org: string; clubClause: string };

const COPY: Record<Language, Copy> = {
  en: {
    club: (c) => ` I saw your profile with ${c}.`,
    intro: (p) => `Hi ${p.first}, I'm ${p.sender} from ${p.org}.${p.clubClause} We help international volleyball players explore opportunities in the USA, and I'd love to tell you a bit more if you're open to it. If you're not interested, just say so and I won't message you again.`,
    introMinor: (p) => `Hi ${p.first}, I'm ${p.sender} from ${p.org}.${p.clubClause} We help international volleyball players explore opportunities in the USA. Since you may be under 18, please feel free to share this message with a parent or guardian; any further conversation would include them. If you're not interested, just say so and I won't message you again.`,
    followup: (p) => `Hi ${p.first}, just a quick follow-up on my earlier message from ${p.org}. If you'd like to hear about opportunities in the USA, reply here and I'll share details. If not, no problem, just let me know and I won't write again. - ${p.sender}`,
    followupMinor: (p) => `Hi ${p.first}, a quick follow-up on my earlier message from ${p.org}. Please feel free to share it with a parent or guardian. If you'd like to know more, reply here; if not, just tell me and I won't write again. - ${p.sender}`,
  },
  it: {
    club: (c) => ` Ho visto il tuo profilo con ${c}.`,
    intro: (p) => `Ciao ${p.first}, sono ${p.sender} di ${p.org}.${p.clubClause} Aiutiamo giocatori e giocatrici di pallavolo internazionali a scoprire opportunità negli Stati Uniti e mi farebbe piacere raccontarti di più, se ti va. Se non sei interessato/a, scrivimelo e non ti contatterò più.`,
    introMinor: (p) => `Ciao ${p.first}, sono ${p.sender} di ${p.org}.${p.clubClause} Aiutiamo giocatori e giocatrici di pallavolo internazionali a scoprire opportunità negli Stati Uniti. Se hai meno di 18 anni, condividi pure questo messaggio con un genitore o tutore: qualsiasi ulteriore conversazione li coinvolgerà. Se non sei interessato/a, scrivimelo e non ti contatterò più.`,
    followup: (p) => `Ciao ${p.first}, ti scrivo per un breve seguito al mio messaggio di ${p.org}. Se vuoi conoscere le opportunità negli USA, rispondi qui e ti darò i dettagli. In caso contrario nessun problema: dimmelo e non ti scriverò più. - ${p.sender}`,
    followupMinor: (p) => `Ciao ${p.first}, un breve seguito al mio messaggio di ${p.org}. Puoi condividerlo con un genitore o tutore. Se vuoi saperne di più rispondi qui; altrimenti dimmelo e non ti scriverò più. - ${p.sender}`,
  },
  es: {
    club: (c) => ` Vi tu perfil con ${c}.`,
    intro: (p) => `Hola ${p.first}, soy ${p.sender} de ${p.org}.${p.clubClause} Ayudamos a jugadores y jugadoras de voleibol internacionales a explorar oportunidades en Estados Unidos y me encantaría contarte más si te interesa. Si no te interesa, dímelo y no volveré a escribirte.`,
    introMinor: (p) => `Hola ${p.first}, soy ${p.sender} de ${p.org}.${p.clubClause} Ayudamos a jugadores y jugadoras de voleibol internacionales a explorar oportunidades en Estados Unidos. Si eres menor de 18 años, comparte este mensaje con un padre, madre o tutor; cualquier conversación posterior los incluirá. Si no te interesa, dímelo y no volveré a escribirte.`,
    followup: (p) => `Hola ${p.first}, solo un breve seguimiento a mi mensaje anterior de ${p.org}. Si quieres conocer las oportunidades en EE. UU., responde aquí y te daré los detalles. Si no, no hay problema: avísame y no volveré a escribir. - ${p.sender}`,
    followupMinor: (p) => `Hola ${p.first}, un breve seguimiento a mi mensaje anterior de ${p.org}. Puedes compartirlo con un padre, madre o tutor. Si quieres saber más, responde aquí; si no, avísame y no volveré a escribir. - ${p.sender}`,
  },
  pt: {
    club: (c) => ` Vi o seu perfil no ${c}.`,
    intro: (p) => `Olá ${p.first}, sou ${p.sender} da ${p.org}.${p.clubClause} Ajudamos atletas internacionais de voleibol a conhecer oportunidades nos Estados Unidos e gostaria de contar mais, se tiver interesse. Se não tiver interesse, é só avisar e não vou mais escrever.`,
    introMinor: (p) => `Olá ${p.first}, sou ${p.sender} da ${p.org}.${p.clubClause} Ajudamos atletas internacionais de voleibol a conhecer oportunidades nos Estados Unidos. Se tiver menos de 18 anos, compartilhe esta mensagem com um pai, mãe ou responsável; qualquer conversa posterior incluirá essa pessoa. Se não tiver interesse, é só avisar e não vou mais escrever.`,
    followup: (p) => `Olá ${p.first}, só um rápido acompanhamento da minha mensagem anterior da ${p.org}. Se quiser conhecer as oportunidades nos EUA, responda aqui e envio os detalhes. Se não, sem problema: é só avisar e não escrevo mais. - ${p.sender}`,
    followupMinor: (p) => `Olá ${p.first}, um rápido acompanhamento da minha mensagem anterior da ${p.org}. Pode compartilhá-la com um pai, mãe ou responsável. Se quiser saber mais, responda aqui; se não, é só avisar e não escrevo mais. - ${p.sender}`,
  },
};

export function renderMessage(p: TemplateParams): string {
  const copy = COPY[p.language];
  const params: P = {
    first: p.firstName,
    sender: p.senderName,
    org: p.org,
    clubClause: p.club ? copy.club(p.club) : "",
  };
  const fn = p.kind === "intro" ? (p.minor ? copy.introMinor : copy.intro) : p.minor ? copy.followupMinor : copy.followup;
  const text = fn(params).replace(/\s{2,}/g, " ").trim();
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Rendered message is ${text.length} characters (max ${MAX_MESSAGE_LENGTH}).`);
  }
  return text;
}
