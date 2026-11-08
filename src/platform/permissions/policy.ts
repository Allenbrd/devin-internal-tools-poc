import { apps } from "@/apps/registry";
import type { AppManifest } from "@/platform/apps/define";
import { platformApps } from "@/platform/apps/platform-apps";
import { isRole, type Principal, type Role } from "@/platform/auth/types";

type PermissionsOf<T> = T extends { permissions: infer R } ? Extract<keyof R, string> : never;

/** Every permission known to the platform, derived from the app manifests. */
export type Permission = PermissionsOf<(typeof platformApps)[number]> | PermissionsOf<(typeof apps)[number]>;

/** Registered apps followed by platform apps. Lazy to avoid import cycles with the registry. */
export function getAllApps(): readonly AppManifest[] {
  return [...apps, ...platformApps];
}

export type Policy = ReadonlyMap<string, ReadonlySet<Role>>;

/** Compose manifests into one permission -> roles map, rejecting ambiguous config. */
export function buildPolicy(manifests: readonly AppManifest[]): Policy {
  const policy = new Map<string, ReadonlySet<Role>>();
  const ids = new Set<string>();
  for (const app of manifests) {
    if (ids.has(app.id)) throw new Error(`Duplicate app id "${app.id}"`);
    ids.add(app.id);
    for (const [permission, roles] of Object.entries(app.permissions) as [string, readonly Role[]][]) {
      if (!permission.startsWith(`${app.id}:`)) {
        throw new Error(`Permission "${permission}" must be namespaced as "${app.id}:<action>"`);
      }
      if (policy.has(permission)) throw new Error(`Duplicate permission "${permission}"`);
      for (const role of roles) {
        if (!isRole(role)) throw new Error(`Unknown role "${role}" granted "${permission}"`);
      }
      policy.set(permission, new Set(roles));
    }
    if (!(app.accessPermission in app.permissions)) {
      throw new Error(`App "${app.id}" accessPermission "${app.accessPermission}" is not declared`);
    }
  }
  return policy;
}

let cachedPolicy: Policy | undefined;

/** The composed platform policy (validated on first use). */
export function getPolicy(): Policy {
  return (cachedPolicy ??= buildPolicy(getAllApps()));
}

/**
 * Deny by default: false unless the user exists, has a known role, and that
 * role is explicitly granted the permission.
 */
export function hasPermission(user: Principal | null | undefined, permission: string, p: Policy = getPolicy()): boolean {
  if (!user || !isRole(user.role)) return false;
  return p.get(permission)?.has(user.role) ?? false;
}
