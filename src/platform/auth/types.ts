export const ROLES = ["viewer", "operator", "approver", "admin"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * The signed-in user, as seen by apps. Provider-agnostic: the mock provider
 * and a future Entra ID provider both resolve to this shape.
 *
 * `role` is a plain string on purpose: it comes from the identity provider /
 * database and is only trusted after `isRole()`; unknown roles get no permissions.
 * Apps should check permissions (`requirePermission`), never roles.
 */
export interface Principal {
  id: string;
  externalId: string;
  email: string;
  name: string;
  role: string;
}

/**
 * Contract every identity provider implements. Apps never use this directly;
 * they call `getCurrentUser()` / `requirePermission()`.
 *
 * Swapping to Microsoft Entra ID means adding an `entra` implementation
 * (OIDC redirect + callback that upserts the User and calls `establishSession`)
 * and selecting it with AUTH_PROVIDER. No app code changes.
 */
export interface AuthProvider {
  readonly id: string;
  /** Path unauthenticated users are sent to in order to start sign-in. */
  readonly signInPath: string;
  /** Resolve the user for the current request; null when not signed in or disabled. */
  getCurrentUser(): Promise<Principal | null>;
  /** End the current session. */
  signOut(): Promise<void>;
}
