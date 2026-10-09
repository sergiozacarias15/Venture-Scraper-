export type ReplyCategory = "interested" | "not_interested" | "question";

export type Classification = {
  category: ReplyCategory;
  confidence: number;
  /** The athlete asked not to be contacted again (stronger than a plain decline). */
  optOut: boolean;
  needsReview: boolean;
};

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}?\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const OPT_OUT = [
  /\bstop\b/, /\bunsubscribe\b/, /do not (contact|message|write)/, /don'?t (contact|message|write|text)/, /leave me alone/,
  /remove me/, /stop (messaging|writing|contacting)/,
  /non (scrivermi|contattarmi|contattarci) (piu|ancora)/, /non (scrivere|contattare) (piu|ancora)/, /smetti di scrivere/, /cancellami/,
  /no me (escribas|escriba|contactes|molestes|vuelvas a escribir)/, /deja de (escribir|contactar|molestar)/, /no (quiero|deseo) (mas )?(mensajes|que me escribas)/,
  /nao (me )?(escreva|escrevas|contate|contacte|mande|envie) (mais|mensagens)/, /pare de (escrever|enviar|mandar)/, /me (tire|remova)/,
];

const NEGATIVE = [
  /\bnot interested\b/, /\bno thanks?\b/, /\bno thank you\b/, /\bnot (for me|looking|now|at the moment|possible)\b/, /\bi'?m (good|all set)\b/, /\bdecline\b/,
  /\bnot (really )?(interested|keen)\b/, /\bwe (are|re) not interested\b/,
  /non (sono|siamo) interessat/, /non mi interessa/, /no grazie/, /non (sono )?interessat/, /non (e|è) (per me|possibile)/, /non al momento/, /non ora/,
  /no me interesa/, /no estoy interesad/, /no gracias/, /no (por ahora|en este momento)/, /no (es|me) (para mi|conviene)/,
  /nao (tenho|estou|tem) interesse/, /nao estou interessad/, /nao me interessa/, /nao obrigad/, /sem interesse/, /agora nao/, /nao (por enquanto|no momento)/,
  /^(no|nao|non)$/, /^(no|nao|non) (thanks|thank you|gracias|grazie|obrigad[oa])\b/,
];

const POSITIVE = [
  /\binterested\b/, /\byes\b/, /\byeah\b/, /\bsure\b/, /\bof course\b/, /\bsounds (good|great|interesting)\b/, /\btell me more\b/, /\bsend (me )?(more )?(info|details|information)\b/,
  /\bi('d| would) (love|like) to\b/, /\bplease (send|share|tell)\b/, /\bhappy to (chat|talk)\b/, /\blet'?s (talk|chat)\b/,
  /\bsono interessat/, /\bmi interessa\b/, /\bcerto\b/, /\bsi\b.*\b(volentieri|certo|grazie|mi piacerebbe)\b/, /\bvolentieri\b/, /\bmi piacerebbe\b/, /\bdimmi di piu\b/, /\bmandami (info|dettagli|informazioni)\b/, /\bsi grazie\b/,
  /\bme interesa\b/, /\bestoy interesad/, /\bclaro\b/, /\bme encantaria\b/, /\bcuentame mas\b/, /\benviame (info|detalles|informacion)\b/, /\bpor supuesto\b/, /\bsi por favor\b/, /\bsi quiero\b/,
  /\btenho interesse\b/, /\bestou interessad/, /\bme interessa\b/, /\bgostaria\b/, /\bquero saber\b/, /\bpode (enviar|mandar)\b/, /\bme conta mais\b/, /\bclaro que sim\b/, /\bcom certeza\b/, /\bsim\b/, /^si\b/,
];

const UNSURE = [/\bnot sure\b/, /\bmaybe\b/, /\bno estoy segur/, /\btal vez\b/, /\bquizas\b/, /\bnon sono sicur/, /\bforse\b/, /\bnao tenho certeza\b/, /\btalvez\b/];

const QUESTION_HINTS = [
  /\?/, /\b(what|how|which|where|when|who|why|can you|could you|do you|is it|are you|does)\b/,
  /\b(cosa|come|quando|dove|quanto|quale|chi|perche|puoi|potresti)\b/,
  /\b(que|como|cuando|donde|cuanto|cual|quien|por que|puedes|podrias)\b/,
  /\b(o que|como|quando|onde|quanto|qual|quem|por que|porque|pode|poderia)\b/,
];

/** Rule-based, multilingual (EN/IT/ES/PT) reply classifier. Ambiguous replies go to a human. */
export function classifyReply(rawText: string): Classification {
  const text = normalize(rawText);
  if (!text) return { category: "question", confidence: 0.2, optOut: false, needsReview: true };

  if (OPT_OUT.some((r) => r.test(text))) {
    return { category: "not_interested", confidence: 0.95, optOut: true, needsReview: false };
  }
  if (NEGATIVE.some((r) => r.test(text))) {
    return { category: "not_interested", confidence: 0.85, optOut: false, needsReview: false };
  }
  if (UNSURE.some((r) => r.test(text))) return { category: "question", confidence: 0.4, optOut: false, needsReview: true };
  const positive = POSITIVE.some((r) => r.test(text));
  const question = QUESTION_HINTS.some((r) => r.test(text));
  if (positive) {
    return { category: "interested", confidence: question ? 0.65 : 0.85, optOut: false, needsReview: question };
  }
  if (question) return { category: "question", confidence: 0.7, optOut: false, needsReview: false };
  return { category: "question", confidence: 0.3, optOut: false, needsReview: true };
}
