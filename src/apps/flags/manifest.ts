import { defineApp } from "@/platform/apps";

export const flagsApp = defineApp({
  id: "flags",
  name: "Feature Flags",
  description: "See feature flags per environment. Operators toggle dev and staging; prod changes need an approver.",
  href: "/apps/flags",
  accessPermission: "flags:read",
  permissions: {
    "flags:read": ["viewer", "operator", "approver", "admin"],
    // Toggle dev/staging directly; request a prod toggle.
    "flags:toggle": ["operator", "admin"],
    // Approve or reject a requested prod toggle (never your own).
    "flags:approve": ["approver", "admin"],
  },
});
