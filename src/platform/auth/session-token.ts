import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless, HMAC-signed platform session token: base64url(payload).base64url(sig).
 * Identity-provider agnostic; providers call `establishSession(userId)` after
 * they have verified who the user is. Pure (no Next.js imports) so it can be
 * used from `proxy.ts` and unit tests.
 */
export const SESSION_COOKIE = "itp_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const DEV_SECRET = "dev-only-insecure-session-secret-change-me-0123456789";

export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters long (see .env.example)");
  }
  if (process.env.NODE_ENV === "production" && secret === DEV_SECRET && process.env.ALLOW_MOCK_AUTH !== "true") {
    throw new Error("Refusing to use the development SESSION_SECRET in production");
  }
  return secret;
}

function sign(data: string, secret: string) {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function createSessionToken(userId: string, now = Date.now(), secret = getSessionSecret()): string {
  const iat = Math.floor(now / 1000);
  const payload: SessionPayload = { sub: userId, iat, exp: iat + SESSION_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function verifySessionToken(
  token: string | undefined | null,
  now = Date.now(),
  secret = getSessionSecret(),
): SessionPayload | null {
  if (!token) return null;
  const [body, signature, ...rest] = token.split(".");
  if (!body || !signature || rest.length > 0) return null;

  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number" || typeof payload.iat !== "number") {
      return null;
    }
    if (payload.exp <= Math.floor(now / 1000)) return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
