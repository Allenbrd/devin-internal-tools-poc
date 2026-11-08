import "server-only";
import { redirect } from "next/navigation";
import { recordAudit } from "@/platform/audit";
import { getAuthProvider, getCurrentUser, type Principal } from "@/platform/auth";
import { ForbiddenError, UnauthenticatedError } from "./errors";
import { hasPermission, type Permission } from "./policy";

export interface RequirePermissionOptions {
  /**
   * "redirect" (default): send the user to sign-in / the forbidden page. Use in
   * pages, layouts and form actions.
   * "throw": throw UnauthenticatedError / ForbiddenError. Use in route handlers
   * and actions that return structured results.
   */
  onDenied?: "redirect" | "throw";
}

/**
 * The single authorization gate. Every page, route handler and server action
 * calls this before doing anything else (enforced by tests/guard-coverage.test.ts).
 * Returns the signed-in user when allowed; denials are audited.
 */
export async function requirePermission(
  permission: Permission,
  { onDenied = "redirect" }: RequirePermissionOptions = {},
): Promise<Principal> {
  const user = await getCurrentUser();

  if (!user) {
    if (onDenied === "throw") throw new UnauthenticatedError();
    redirect(getAuthProvider().signInPath);
  }

  if (!hasPermission(user, permission)) {
    await recordAudit({ actor: user, action: "access.denied", outcome: "denied", metadata: { permission } });
    if (onDenied === "throw") throw new ForbiddenError(permission);
    redirect("/forbidden");
  }

  return user;
}

/** Map auth errors to JSON responses in route handlers; rethrows anything else. */
export function authErrorResponse(error: unknown): Response {
  if (error instanceof UnauthenticatedError || error instanceof ForbiddenError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  throw error;
}
