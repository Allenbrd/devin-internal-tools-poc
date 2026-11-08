import type { Role } from "@/platform/auth/types";

/**
 * Everything the platform needs to know about an app. Pure data: no imports
 * of server code, so it is safe to use anywhere.
 */
export interface AppManifest<P extends string = string> {
  /** Stable id; also the required prefix of every permission ("<id>:<action>"). */
  id: string;
  name: string;
  description: string;
  /** Entry route of the app. */
  href: string;
  /** Permission needed to see the app in the nav and to open it. */
  accessPermission: NoInfer<P>;
  /**
   * Permissions the app introduces, and the roles that hold each one.
   * Deny by default: a permission not listed here is granted to nobody.
   */
  permissions: Record<P, readonly Role[]>;
  /** Where the app appears in the nav. Default "apps"; false hides it. */
  nav?: "apps" | "admin" | false;
}

export function defineApp<const P extends string>(manifest: AppManifest<P>): AppManifest<P> {
  return manifest;
}
