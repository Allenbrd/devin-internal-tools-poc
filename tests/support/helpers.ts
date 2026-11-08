import { SESSION_COOKIE, createSessionToken } from "@/platform/auth/session-token";
import { db } from "@/platform/db";
import { cookieJar } from "./next";

export const USERS = {
  viewer: "mock|vera",
  operator: "mock|oscar",
  approver: "mock|april",
  admin: "mock|adam",
} as const;

/** Simulate a signed-in browser for the given seeded user. */
export async function signInAs(who: keyof typeof USERS | { id: string }) {
  const where = typeof who === "string" ? { externalId: USERS[who] } : { id: who.id };
  const user = await db.user.findUniqueOrThrow({ where });
  cookieJar.set(SESSION_COOKIE, createSessionToken(user.id));
  return user;
}

export function lastAuditEvent(where: { action?: string; actorEmail?: string; resourceId?: string } = {}) {
  return db.auditEvent.findFirst({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
}

export async function anyCustomer() {
  return db.customer.findFirstOrThrow({ orderBy: { name: "asc" } });
}

export function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}
