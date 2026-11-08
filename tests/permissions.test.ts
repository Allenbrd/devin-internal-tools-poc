import { describe, expect, it } from "vitest";
import { getAccessibleApps } from "@/platform/apps/access";
import { defineApp } from "@/platform/apps/define";
import type { Principal } from "@/platform/auth";
import { buildPolicy, getPolicy, hasPermission } from "@/platform/permissions/policy";

const user = (role: string): Principal => ({ id: "u1", externalId: "x", email: "u@example.com", name: "U", role });

describe("hasPermission: deny by default", () => {
  it("denies when there is no user", () => {
    expect(hasPermission(null, "customers:read")).toBe(false);
    expect(hasPermission(undefined, "platform:access")).toBe(false);
  });

  it("denies every permission to an unknown role", () => {
    for (const permission of getPolicy().keys()) {
      expect(hasPermission(user("superuser"), permission)).toBe(false);
      expect(hasPermission(user(""), permission)).toBe(false);
    }
  });

  it("denies permissions that are not declared anywhere, even for admin", () => {
    expect(hasPermission(user("admin"), "customers:delete")).toBe(false);
    expect(hasPermission(user("admin"), "*")).toBe(false);
    expect(hasPermission(user("admin"), "")).toBe(false);
  });

  it("grants exactly the declared role matrix", () => {
    const matrix = Object.fromEntries([...getPolicy()].map(([permission, roles]) => [permission, [...roles].sort()]));
    expect(matrix).toEqual({
      "platform:access": ["admin", "approver", "operator", "viewer"],
      "audit:read": ["admin"],
      "customers:read": ["admin", "approver", "operator", "viewer"],
      "customers:update": ["admin", "operator"],
      "customers:unmask_iban": ["admin", "approver"],
      "refunds:read": ["admin", "approver", "operator"],
      "refunds:create": ["admin", "operator"],
      "refunds:approve": ["admin", "approver"],
      "refunds:pay": ["admin", "operator"],
      "refunds:unmask_iban": ["admin", "approver"],
    });
  });
});

describe("buildPolicy validation", () => {
  const base = { name: "X", description: "", href: "/x" };

  it("rejects permissions outside the app namespace", () => {
    const app = defineApp({ ...base, id: "x", accessPermission: "y:read", permissions: { "y:read": ["admin"] } });
    expect(() => buildPolicy([app])).toThrow(/namespaced/);
  });

  it("rejects duplicate app ids", () => {
    const app = defineApp({ ...base, id: "x", accessPermission: "x:read", permissions: { "x:read": ["admin"] } });
    expect(() => buildPolicy([app, app])).toThrow(/Duplicate app id/);
  });

  it("rejects unknown roles", () => {
    // @ts-expect-error "root" is not a Role
    const app = defineApp({ ...base, id: "x", accessPermission: "x:read", permissions: { "x:read": ["root"] } });
    expect(() => buildPolicy([app])).toThrow(/Unknown role/);
  });
});

describe("app shell navigation", () => {
  const names = (role: string) => getAccessibleApps(user(role)).map((a) => a.name);

  it("only lists apps the user can access", () => {
    expect(names("viewer")).toEqual(["Customer Directory"]);
    expect(names("operator")).toEqual(["Customer Directory", "Refunds"]);
    expect(names("approver")).toEqual(["Customer Directory", "Refunds"]);
    expect(names("admin")).toEqual(["Customer Directory", "Refunds", "Audit log"]);
    expect(names("unknown")).toEqual([]);
    expect(getAccessibleApps(null)).toEqual([]);
  });
});
