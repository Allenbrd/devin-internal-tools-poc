import { beforeAll, describe, expect, it } from "vitest";
import { GET as customersApi } from "@/app/api/apps/customers/route";
import { SESSION_COOKIE } from "@/platform/auth/session-token";
import { db } from "@/platform/db";
import { ForbiddenError, UnauthenticatedError, requirePermission } from "@/platform/permissions";
import { SEED_CUSTOMERS } from "../prisma/seed";
import { lastAuditEvent, signInAs } from "./support/helpers";
import { RedirectError, cookieJar } from "./support/next";

describe("requirePermission", () => {
  let disabledUser: { id: string };
  let unknownRoleUser: { id: string };

  beforeAll(async () => {
    disabledUser = await db.user.create({
      data: { externalId: "test|disabled", email: "disabled@example.com", name: "Disabled", role: "admin", active: false },
    });
    unknownRoleUser = await db.user.create({
      data: { externalId: "test|weird", email: "weird@example.com", name: "Weird", role: "superuser" },
    });
  });

  it("rejects requests without a session", async () => {
    await expect(requirePermission("platform:access", { onDenied: "throw" })).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(requirePermission("platform:access")).rejects.toEqual(new RedirectError("/sign-in"));
  });

  it("rejects a forged session cookie", async () => {
    const user = await signInAs("admin");
    cookieJar.set(SESSION_COOKIE, `${Buffer.from(JSON.stringify({ sub: user.id, iat: 0, exp: 9e9 })).toString("base64url")}.forged`);
    await expect(requirePermission("platform:access", { onDenied: "throw" })).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("rejects deactivated users even with a valid session", async () => {
    await signInAs(disabledUser);
    await expect(requirePermission("platform:access", { onDenied: "throw" })).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("denies users with an unknown role everything, and audits it", async () => {
    await signInAs(unknownRoleUser);
    await expect(requirePermission("platform:access", { onDenied: "throw" })).rejects.toBeInstanceOf(ForbiddenError);
    const event = await lastAuditEvent({ actorEmail: "weird@example.com" });
    expect(event).toMatchObject({ action: "access.denied", outcome: "denied", actorRole: "superuser" });
  });

  it("denies a missing permission, redirects to /forbidden and writes an audit event", async () => {
    await signInAs("viewer");
    await expect(requirePermission("customers:update")).rejects.toEqual(new RedirectError("/forbidden"));
    const event = await lastAuditEvent({ action: "access.denied" });
    expect(event).toMatchObject({ actorEmail: "vera.viewer@example.com", outcome: "denied" });
    expect(JSON.parse(event!.metadata!)).toEqual({ permission: "customers:update" });
  });

  it("returns the principal when the role holds the permission", async () => {
    await signInAs("operator");
    const user = await requirePermission("customers:update");
    expect(user).toMatchObject({ email: "oscar.operator@example.com", role: "operator" });
  });

  it("guards route handlers with JSON 401/403 and never leaks plaintext", async () => {
    expect((await customersApi()).status).toBe(401);

    await signInAs("viewer");
    const res = await customersApi();
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("****");
    for (const { iban } of SEED_CUSTOMERS) expect(body).not.toContain(iban);
  });
});
