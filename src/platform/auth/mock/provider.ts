import "server-only";
import { db } from "@/platform/db";
import { clearSession, establishSession, readSessionUserId } from "../session";
import type { AuthProvider, Principal } from "../types";

export function assertMockAuthAllowed() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_AUTH !== "true") {
    throw new Error("Mock SSO is disabled in production. Configure a real AUTH_PROVIDER.");
  }
}

function toPrincipal(user: { id: string; externalId: string; email: string; name: string; role: string }): Principal {
  return { id: user.id, externalId: user.externalId, email: user.email, name: user.name, role: user.role };
}

/**
 * Mock SSO: users pick a seeded account on /sign-in. The user row is re-read
 * on every request so role changes and deactivation apply immediately.
 */
export const mockAuthProvider: AuthProvider & {
  listSignInOptions(): Promise<Principal[]>;
  signInAs(userId: string): Promise<Principal | null>;
} = {
  id: "mock",
  signInPath: "/sign-in",

  async getCurrentUser() {
    // Read the request first: marks the route dynamic before any guard can throw at build time.
    const userId = await readSessionUserId();
    assertMockAuthAllowed();
    if (!userId) return null;
    const user = await db.user.findUnique({ where: { id: userId } });
    return user?.active ? toPrincipal(user) : null;
  },

  async signOut() {
    await clearSession();
  },

  async listSignInOptions() {
    assertMockAuthAllowed();
    const users = await db.user.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
    return users.map(toPrincipal);
  },

  async signInAs(userId: string) {
    assertMockAuthAllowed();
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user?.active) return null;
    await establishSession(user.id);
    return toPrincipal(user);
  },
};
