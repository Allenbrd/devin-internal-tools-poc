import { defineApp } from "@/platform/apps";

export const customersApp = defineApp({
  id: "customers",
  name: "Customer Directory",
  description: "Sample app: browse customers, edit details, reveal IBANs with permission.",
  href: "/apps/customers",
  accessPermission: "customers:read",
  permissions: {
    "customers:read": ["viewer", "operator", "approver", "admin"],
    "customers:update": ["operator", "admin"],
    "customers:unmask_iban": ["approver", "admin"],
  },
});
