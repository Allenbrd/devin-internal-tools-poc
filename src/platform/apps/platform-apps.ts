import { ROLES } from "@/platform/auth/types";
import { defineApp } from "./define";

/** Built-in platform "apps": the home page and the admin audit log. */
export const homeApp = defineApp({
  id: "platform",
  name: "Home",
  description: "Internal tools home",
  href: "/",
  accessPermission: "platform:access",
  permissions: { "platform:access": ROLES },
  nav: false,
});

export const auditLogApp = defineApp({
  id: "audit",
  name: "Audit log",
  description: "Append-only record of who did what, and when.",
  href: "/admin/audit",
  accessPermission: "audit:read",
  permissions: { "audit:read": ["admin"] },
  nav: "admin",
});

export const platformApps = [homeApp, auditLogApp] as const;
