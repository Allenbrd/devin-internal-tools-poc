import { defineApp } from "@/platform/apps";

export const refundsApp = defineApp({
  id: "refunds",
  name: "Refunds",
  description: "Request refunds and approve them under four-eyes rules.",
  href: "/apps/refunds",
  accessPermission: "refunds:read",
  permissions: {
    "refunds:read": ["operator", "approver", "admin"],
    "refunds:create": ["operator", "admin"],
    "refunds:approve": ["approver", "admin"],
    "refunds:pay": ["operator", "admin"],
    "refunds:unmask_iban": ["approver", "admin"],
  },
});
