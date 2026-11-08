import type { Principal } from "@/platform/auth/types";
import { getAllApps, hasPermission } from "@/platform/permissions/policy";
import type { AppManifest } from "./define";

/** Apps the user can open, in registry order. Drives the nav and home page. */
export function getAccessibleApps(user: Principal | null): AppManifest[] {
  return getAllApps().filter((app) => app.nav !== false && hasPermission(user, app.accessPermission));
}
