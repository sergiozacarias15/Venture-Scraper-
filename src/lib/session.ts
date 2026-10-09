export const SESSION_COOKIE = "vo_session";
const TTL_MS = 1000 * 60 * 60 * 24 * 7;

const enc = new TextEncoder();

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function sessionSecret(env: NodeJS.ProcessEnv = process.env) {
  return env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD || "";
}

/** Edge-compatible (Web Crypto) so it can run inside middleware. */
export async function signSession(secret: string, now = Date.now()) {
  const exp = String(now + TTL_MS);
  return `${exp}.${await hmac(secret, exp)}`;
}

export async function verifySession(secret: string, token: string | undefined, now = Date.now()) {
  if (!secret || !token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < now) return false;
  return constantTimeEqual(sig, await hmac(secret, exp));
}
