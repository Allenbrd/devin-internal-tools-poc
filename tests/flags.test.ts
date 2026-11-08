import { describe, expect, it } from "vitest";
import FlagPage from "@/app/(shell)/apps/flags/[id]/page";
import FlagsPage from "@/app/(shell)/apps/flags/page";
import { approveProdToggle, rejectProdToggle, requestProdToggle, toggleFlag } from "@/apps/flags/actions";
import { listFlags } from "@/apps/flags/data";
import { db } from "@/platform/db";
import { hasPermission } from "@/platform/permissions";
import { SEED_FLAGS, SEED_PENDING_REQUEST } from "../prisma/seed";
import { form, lastAuditEvent, signInAs } from "./support/helpers";
import { RedirectError } from "./support/next";

let counter = 0;
function makeFlag(environment: "dev" | "staging" | "prod", enabled = false) {
  return db.featureFlag.create({
    data: { key: `test-flag-${Date.now()}-${counter++}`, description: "Test flag", environment, enabled },
  });
}

const reload = (id: string) => db.featureFlag.findUniqueOrThrow({ where: { id } });
const toggle = (id: string, enabled: boolean) => toggleFlag({ ok: false }, form({ id, enabled: String(enabled) }));
const request = (id: string, enabled: boolean, reason = "Rollout approved") =>
  requestProdToggle({ ok: false }, form({ id, enabled: String(enabled), reason }));
const approve = (requestId: string) => approveProdToggle({ ok: false }, form({ requestId }));
const reject = (requestId: string) => rejectProdToggle({ ok: false }, form({ requestId }));
const pendingRequestFor = (flagId: string) => db.flagChangeRequest.findFirstOrThrow({ where: { flagId, status: "pending" } });
const pageProps = <T,>(value: T) => ({ params: Promise.resolve(value), searchParams: Promise.resolve(value) }) as never;

describe("flags: role grants", () => {
  it("grants exactly what was asked for", async () => {
    const roles = ["viewer", "operator", "approver", "admin"] as const;
    const grants = Object.fromEntries(
      roles.map((r) => [r, (["flags:read", "flags:toggle", "flags:approve"] as const).filter((p) => hasPermission({ role: r } as never, p))]),
    );
    expect(grants).toEqual({
      viewer: ["flags:read"],
      operator: ["flags:read", "flags:toggle"],
      approver: ["flags:read", "flags:approve"],
      admin: ["flags:read", "flags:toggle", "flags:approve"],
    });
  });
});

describe("flags: viewing", () => {
  it("lists every seeded flag with key, description, environment and state", async () => {
    const flags = await listFlags();
    for (const seeded of SEED_FLAGS) {
      expect(flags).toContainEqual(expect.objectContaining(seeded));
    }
    const prod = await listFlags({ environment: "prod" });
    expect(prod.length).toBeGreaterThan(0);
    expect(prod.every((f) => f.environment === "prod")).toBe(true);
  });

  it.each(["viewer", "operator", "approver", "admin"] as const)("lets %s open the list and detail pages", async (role) => {
    await signInAs(role);
    const flag = await makeFlag("dev");
    await expect(FlagsPage(pageProps({}))).resolves.toBeTruthy();
    await expect(FlagPage(pageProps({ id: flag.id }))).resolves.toBeTruthy();
  });

  it("sends signed-out users to sign-in and unknown roles to /forbidden", async () => {
    await expect(FlagsPage(pageProps({}))).rejects.toEqual(new RedirectError("/sign-in"));
    const weird = await db.user.create({
      data: { externalId: "test|flags-weird", email: "flags-weird@example.com", name: "Weird", role: "superuser" },
    });
    await signInAs(weird);
    await expect(FlagsPage(pageProps({}))).rejects.toEqual(new RedirectError("/forbidden"));
    expect(await lastAuditEvent({ actorEmail: weird.email })).toMatchObject({ action: "access.denied", outcome: "denied" });
  });

  it("seeds a pending prod request from an operator", async () => {
    const flag = await db.featureFlag.findUniqueOrThrow({
      where: { key_environment: { key: SEED_PENDING_REQUEST.key, environment: SEED_PENDING_REQUEST.environment } },
    });
    const pending = await pendingRequestFor(flag.id);
    expect(pending).toMatchObject({ enabled: true, requestedByEmail: "oscar.operator@example.com", pendingFlagId: flag.id });
  });
});

describe("flags: toggling dev and staging", () => {
  it.each(["dev", "staging"] as const)("operator toggles a %s flag; before/after are audited", async (env) => {
    const user = await signInAs("operator");
    const flag = await makeFlag(env, false);

    expect(await toggle(flag.id, true)).toMatchObject({ ok: true });
    expect((await reload(flag.id)).enabled).toBe(true);
    const on = (await lastAuditEvent({ action: "flag.toggle", resourceId: flag.id }))!;
    expect(on).toMatchObject({ actorEmail: user.email, actorRole: "operator", outcome: "success", resourceType: "feature_flag" });
    expect(JSON.parse(on.before!)).toEqual({ enabled: false });
    expect(JSON.parse(on.after!)).toEqual({ enabled: true });
    expect(JSON.parse(on.metadata!)).toEqual({ key: flag.key, environment: env });

    expect(await toggle(flag.id, false)).toMatchObject({ ok: true });
    expect((await reload(flag.id)).enabled).toBe(false);
    expect(await db.auditEvent.count({ where: { action: "flag.toggle", resourceId: flag.id, outcome: "success" } })).toBe(2);
  });

  it("is a no-op (and writes nothing) when the flag is already in the requested state", async () => {
    await signInAs("operator");
    const flag = await makeFlag("dev", true);
    expect(await toggle(flag.id, true)).toEqual({ ok: false, message: "Flag is already on." });
    expect(await db.auditEvent.count({ where: { resourceId: flag.id } })).toBe(0);
  });

  it.each(["viewer", "approver"] as const)("is denied to %s, audited, and the flag is unchanged", async (role) => {
    const user = await signInAs(role);
    const flag = await makeFlag("dev", false);
    expect(await toggle(flag.id, true)).toMatchObject({ ok: false });
    expect((await reload(flag.id)).enabled).toBe(false);
    const event = (await lastAuditEvent({ actorEmail: user.email }))!;
    expect(event).toMatchObject({ action: "access.denied", outcome: "denied" });
    expect(JSON.parse(event.metadata!)).toEqual({ permission: "flags:toggle" });
  });

  it("requires a session", async () => {
    const flag = await makeFlag("dev", false);
    expect(await toggle(flag.id, true)).toMatchObject({ ok: false });
    expect((await reload(flag.id)).enabled).toBe(false);
  });

  it("rejects invalid input", async () => {
    await signInAs("operator");
    const flag = await makeFlag("dev", false);
    const res = await toggleFlag({ ok: false }, form({ id: flag.id, enabled: "yes" }));
    expect(res.ok).toBe(false);
    expect(res.errors?.enabled).toBeDefined();
    expect(await toggle("does-not-exist", true)).toEqual({ ok: false, message: "Flag not found." });
  });
});

describe("flags: prod needs an approver", () => {
  it.each(["operator", "admin"] as const)("refuses a direct prod toggle by %s and audits the attempt", async (role) => {
    const user = await signInAs(role);
    const flag = await makeFlag("prod", false);
    expect(await toggle(flag.id, true)).toMatchObject({ ok: false, message: expect.stringContaining("need an approver") });
    expect((await reload(flag.id)).enabled).toBe(false);
    const event = (await lastAuditEvent({ action: "flag.toggle", resourceId: flag.id }))!;
    expect(event).toMatchObject({ actorEmail: user.email, outcome: "denied" });
    expect(JSON.parse(event.metadata!)).toMatchObject({ reason: "approval_required", environment: "prod", requestedEnabled: true });
  });

  it("operator requests, a different approver approves: the flag changes and each step is audited", async () => {
    const operator = await signInAs("operator");
    const flag = await makeFlag("prod", false);

    expect(await request(flag.id, true, "CAB-123 approved")).toMatchObject({ ok: true });
    expect((await reload(flag.id)).enabled).toBe(false);
    const pending = await pendingRequestFor(flag.id);
    expect(pending).toMatchObject({ enabled: true, requestedById: operator.id, reason: "CAB-123 approved" });
    const requested = (await lastAuditEvent({ action: "flag.toggle_request", resourceId: flag.id }))!;
    expect(requested).toMatchObject({ actorEmail: operator.email, outcome: "success" });
    expect(JSON.parse(requested.after!)).toEqual({ requestedEnabled: true, status: "pending" });
    expect(JSON.parse(requested.metadata!)).toMatchObject({ requestId: pending.id, reason: "CAB-123 approved" });

    const approver = await signInAs("approver");
    expect(await approve(pending.id)).toMatchObject({ ok: true });
    expect((await reload(flag.id)).enabled).toBe(true);
    expect(await db.flagChangeRequest.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({
      status: "approved",
      pendingFlagId: null,
      decidedById: approver.id,
    });
    const approved = (await lastAuditEvent({ action: "flag.toggle_approve", resourceId: flag.id }))!;
    expect(approved).toMatchObject({ actorEmail: approver.email, actorRole: "approver", outcome: "success" });
    expect(JSON.parse(approved.before!)).toEqual({ enabled: false });
    expect(JSON.parse(approved.after!)).toEqual({ enabled: true });
    expect(JSON.parse(approved.metadata!)).toMatchObject({ requestId: pending.id, requestedBy: operator.email });

    expect(await approve(pending.id)).toEqual({ ok: false, message: "This request is no longer pending." });
  });

  it("approver rejects: the flag is unchanged and the rejection is audited", async () => {
    await signInAs("operator");
    const flag = await makeFlag("prod", true);
    await request(flag.id, false);
    const pending = await pendingRequestFor(flag.id);

    const approver = await signInAs("approver");
    expect(await reject(pending.id)).toMatchObject({ ok: true });
    expect((await reload(flag.id)).enabled).toBe(true);
    expect((await db.flagChangeRequest.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("rejected");
    expect(await lastAuditEvent({ action: "flag.toggle_reject", resourceId: flag.id })).toMatchObject({
      actorEmail: approver.email,
      outcome: "success",
    });
    expect(await approve(pending.id)).toEqual({ ok: false, message: "This request is no longer pending." });
  });

  it("forbids approving your own request (admin holds both permissions), and audits the attempt", async () => {
    const admin = await signInAs("admin");
    const flag = await makeFlag("prod", false);
    expect(await request(flag.id, true)).toMatchObject({ ok: true });
    const pending = await pendingRequestFor(flag.id);

    expect(await approve(pending.id)).toEqual({ ok: false, message: "You can't approve your own request." });
    expect((await reload(flag.id)).enabled).toBe(false);
    expect((await db.flagChangeRequest.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("pending");
    const event = (await lastAuditEvent({ action: "flag.toggle_approve", resourceId: flag.id }))!;
    expect(event).toMatchObject({ actorEmail: admin.email, outcome: "denied" });
    expect(JSON.parse(event.metadata!)).toMatchObject({ reason: "self_approval", requestId: pending.id });

    await signInAs("approver");
    expect(await approve(pending.id)).toMatchObject({ ok: true });
    expect((await reload(flag.id)).enabled).toBe(true);
  });

  it.each(["viewer", "operator"] as const)("does not let %s approve or reject", async (role) => {
    await signInAs("admin");
    const flag = await makeFlag("prod", false);
    await request(flag.id, true);
    const pending = await pendingRequestFor(flag.id);

    const user = await signInAs(role);
    expect(await approve(pending.id)).toMatchObject({ ok: false });
    expect(await reject(pending.id)).toMatchObject({ ok: false });
    expect((await reload(flag.id)).enabled).toBe(false);
    expect((await db.flagChangeRequest.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("pending");
    const event = (await lastAuditEvent({ actorEmail: user.email }))!;
    expect(event).toMatchObject({ action: "access.denied", outcome: "denied" });
    expect(JSON.parse(event.metadata!)).toEqual({ permission: "flags:approve" });
  });

  it("does not let viewers or approvers request prod toggles", async () => {
    const flag = await makeFlag("prod", false);
    for (const role of ["viewer", "approver"] as const) {
      await signInAs(role);
      expect(await request(flag.id, true)).toMatchObject({ ok: false });
    }
    expect(await db.flagChangeRequest.count({ where: { flagId: flag.id } })).toBe(0);
  });

  it("allows one pending request per flag, needs a reason, and rejects no-op or non-prod requests", async () => {
    await signInAs("operator");
    const flag = await makeFlag("prod", false);

    const noReason = await request(flag.id, true, " ");
    expect(noReason.ok).toBe(false);
    expect(noReason.errors?.reason).toBeDefined();
    expect(await request(flag.id, false)).toEqual({ ok: false, message: "Flag is already off." });

    expect(await request(flag.id, true)).toMatchObject({ ok: true });
    expect(await request(flag.id, true)).toEqual({ ok: false, message: "This flag already has a pending request." });
    expect(await db.flagChangeRequest.count({ where: { flagId: flag.id } })).toBe(1);

    const dev = await makeFlag("dev", false);
    expect(await request(dev.id, true)).toMatchObject({ ok: false, message: expect.stringContaining("toggle them directly") });
  });

  it("enforces one pending request per flag in the database too", async () => {
    const operator = await signInAs("operator");
    const flag = await makeFlag("prod", false);
    await request(flag.id, true);
    await expect(
      db.flagChangeRequest.create({
        data: {
          flagId: flag.id,
          enabled: true,
          reason: "dup",
          pendingFlagId: flag.id,
          requestedById: operator.id,
          requestedByEmail: operator.email,
        },
      }),
    ).rejects.toThrow();
  });
});
