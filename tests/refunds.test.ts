import { afterEach, describe, expect, it } from "vitest";
import RefundsPage from "@/app/(shell)/apps/refunds/page";
import { decideRefund, markRefundPaid, requestRefund, type RefundActionState } from "@/apps/refunds/actions";
import { getRefundAuditTrail, listRefunds } from "@/apps/refunds/data";
import {
  REFUND_REASON_CODES,
  checkDecision,
  dualApprovalThresholdMinor,
  parseAmountToMinor,
  reasonCodeRequired,
  requiredApprovalsFor,
} from "@/apps/refunds/policy";
import { getAccessibleApps } from "@/platform/apps/access";
import { db } from "@/platform/db";
import { isValidIban } from "@/platform/validation/iban";
import { SEED_REFUNDS } from "../prisma/seed";
import { USERS, anyCustomer, form, lastAuditEvent, signInAs } from "./support/helpers";
import { RedirectError } from "./support/next";

const IBAN = "GB82WEST12345698765432";
const initial: RefundActionState = { ok: false };

/** Requests a refund as `who` and returns its id (the action redirects to the detail page). */
async function requestAs(who: keyof typeof USERS, amount: string, extra: Record<string, string> = {}) {
  const customer = await db.customer.findFirstOrThrow({ where: { status: "active" }, orderBy: { name: "asc" } });
  await signInAs(who);
  const error = await requestRefund(
    initial,
    form({ customerId: customer.id, amount, currency: "EUR", reason: "Test refund", reasonCode: "goodwill", destinationIban: "GB82 WEST 1234 5698 7654 32", ...extra }),
  ).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(RedirectError);
  return (error as RedirectError).url.split("/").pop()!;
}

async function decideAs(who: keyof typeof USERS, id: string, decision: "approve" | "reject", note?: string) {
  await signInAs(who);
  return decideRefund(initial, form({ id, decision, ...(note && { note }) }));
}

const refund = (id: string) => db.refund.findUniqueOrThrow({ where: { id }, include: { decisions: true } });

describe("refund policy", () => {
  it("parses amounts into minor units", () => {
    expect(parseAmountToMinor("500")).toBe(50000);
    expect(parseAmountToMinor("1,250.5")).toBe(125050);
    expect(parseAmountToMinor("0.01")).toBe(1);
    for (const bad of ["", "0", "-5", "1.234", "abc", "1e3", "1000000.01"]) expect(parseAmountToMinor(bad)).toBeNull();
  });

  it("needs two approvals at or above the threshold (default 500)", () => {
    expect(dualApprovalThresholdMinor({})).toBe(50000);
    expect(requiredApprovalsFor(49999, 50000)).toBe(1);
    expect(requiredApprovalsFor(50000, 50000)).toBe(2);
    expect(dualApprovalThresholdMinor({ REFUND_DUAL_APPROVAL_THRESHOLD: "1000" })).toBe(100000);
    expect(() => dualApprovalThresholdMinor({ REFUND_DUAL_APPROVAL_THRESHOLD: "lots" })).toThrow(/Invalid/);
  });

  it("requires a reason code at or above 500, regardless of the approval threshold", () => {
    expect(reasonCodeRequired(49999)).toBe(false);
    expect(reasonCodeRequired(50000)).toBe(true);
  });

  it("blocks self-approval, double decisions and decisions on closed refunds", () => {
    const pending = { status: "requested", requestedById: "op" };
    expect(checkDecision(pending, [], "op")).toEqual({ ok: false, reason: "self_approval" });
    expect(checkDecision(pending, [{ approverId: "ap" }], "ap")).toEqual({ ok: false, reason: "already_decided" });
    expect(checkDecision({ ...pending, status: "approved" }, [], "ap")).toEqual({ ok: false, reason: "not_pending" });
    expect(checkDecision(pending, [{ approverId: "ap" }], "ap2")).toEqual({ ok: true });
  });
});

describe("refunds access", () => {
  it("viewer can't see the app: not in the nav, page redirects to /forbidden, and the denial is audited", async () => {
    const viewer = await signInAs("viewer");
    expect(getAccessibleApps(viewer).map((a) => a.id)).not.toContain("refunds");
    await expect(RefundsPage({ searchParams: Promise.resolve({}) } as never)).rejects.toEqual(new RedirectError("/forbidden"));
    const event = (await lastAuditEvent({ actorEmail: viewer.email }))!;
    expect(event).toMatchObject({ action: "access.denied", outcome: "denied" });
    expect(JSON.parse(event.metadata!)).toEqual({ permission: "refunds:read" });
  });

  it("viewer can't request or decide refunds", async () => {
    const id = await requestAs("operator", "10");
    await signInAs("viewer");
    const customer = await anyCustomer();
    const created = await requestRefund(initial, form({ customerId: customer.id, amount: "5", currency: "EUR", reason: "x x x", destinationIban: IBAN }));
    expect(created.ok).toBe(false);
    expect((await decideAs("viewer", id, "approve")).ok).toBe(false);
    expect((await refund(id)).status).toBe("requested");
  });

  it("operators request but can't approve; approvers approve but can't request", async () => {
    const id = await requestAs("operator", "10");
    const operatorDecision = await decideAs("operator", id, "approve");
    expect(operatorDecision).toMatchObject({ ok: false, message: expect.stringMatching(/permission/) });
    expect(await lastAuditEvent()).toMatchObject({ action: "access.denied", actorEmail: "oscar.operator@example.com" });

    await signInAs("approver");
    const customer = await anyCustomer();
    const created = await requestRefund(initial, form({ customerId: customer.id, amount: "5", currency: "EUR", reason: "x x x", destinationIban: IBAN }));
    expect(created).toMatchObject({ ok: false, message: expect.stringMatching(/permission/) });
  });
});

describe("refund request", () => {
  it("creates a pending refund and audits it with the IBAN masked", async () => {
    const id = await requestAs("operator", "125.40");
    const operator = await db.user.findUniqueOrThrow({ where: { externalId: USERS.operator } });
    expect(await refund(id)).toMatchObject({
      status: "requested",
      amountMinor: 12540,
      currency: "EUR",
      destinationIban: IBAN,
      requiredApprovals: 1,
      requestedById: operator.id,
    });
    const event = (await lastAuditEvent({ action: "refund.request", resourceId: id }))!;
    expect(event).toMatchObject({ actorId: operator.id, resourceType: "refund", outcome: "success", before: null });
    expect(JSON.parse(event.after!)).toMatchObject({ status: "requested", amountMinor: 12540, destinationIban: "****5432" });
    expect(event.after).not.toContain(IBAN);
  });

  it("validates input and writes nothing on error", async () => {
    await signInAs("operator");
    const customer = await anyCustomer();
    const [refunds, events] = [await db.refund.count(), await db.auditEvent.count()];
    const result = await requestRefund(
      initial,
      form({ customerId: customer.id, amount: "12.345", currency: "XYZ", reason: "", destinationIban: "GB00BAD" }),
    );
    expect(Object.keys(result.errors ?? {}).sort()).toEqual(["amount", "currency", "destinationIban", "reason"]);
    expect(await db.refund.count()).toBe(refunds);
    expect(await db.auditEvent.count()).toBe(events);
  });

  it("requires a reason code at 500 and above, and writes nothing without one", async () => {
    await signInAs("operator");
    const customer = await anyCustomer();
    const [refunds, events] = [await db.refund.count(), await db.auditEvent.count()];
    for (const amount of ["500", "1250"]) {
      const result = await requestRefund(initial, form({ customerId: customer.id, amount, currency: "EUR", reason: "Test refund", destinationIban: IBAN }));
      expect(result.errors).toEqual({ reasonCode: ["Choose a reason code for refunds of 500 or more"] });
    }
    expect(await db.refund.count()).toBe(refunds);
    expect(await db.auditEvent.count()).toBe(events);
  });

  it("makes the reason code optional below 500", async () => {
    const id = await requestAs("operator", "499.99", { reasonCode: "" });
    expect((await refund(id)).reasonCode).toBeNull();
    const event = (await lastAuditEvent({ action: "refund.request", resourceId: id }))!;
    expect(JSON.parse(event.after!)).toMatchObject({ reasonCode: null });
  });

  it.each(REFUND_REASON_CODES)("stores and audits reason code %s", async (code) => {
    const id = await requestAs("operator", "750", { reasonCode: code });
    expect((await refund(id)).reasonCode).toBe(code);
    const event = (await lastAuditEvent({ action: "refund.request", resourceId: id }))!;
    expect(JSON.parse(event.after!)).toMatchObject({ reasonCode: code });
  });

  it("rejects unknown reason codes at any amount", async () => {
    await signInAs("operator");
    const customer = await anyCustomer();
    for (const amount of ["20", "750"]) {
      const result = await requestRefund(
        initial,
        form({ customerId: customer.id, amount, currency: "EUR", reason: "Test refund", reasonCode: "chargeback", destinationIban: IBAN }),
      );
      expect(Object.keys(result.errors ?? {})).toEqual(["reasonCode"]);
    }
  });

  it("filters the list by reason code (and 'none'), combined with status", async () => {
    const approver = await signInAs("approver");
    for (const code of REFUND_REASON_CODES) {
      const rows = await listRefunds(approver, { reasonCode: code });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.reasonCode === code)).toBe(true);
    }
    const uncoded = await listRefunds(approver, { reasonCode: "none" });
    expect(uncoded.length).toBeGreaterThan(0);
    expect(uncoded.every((r) => r.reasonCode === null)).toBe(true);
    const paidDuplicates = await listRefunds(approver, { status: "paid", reasonCode: "duplicate_charge" });
    expect(paidDuplicates.map((r) => r.id)).toContain("seed-refund-07");
    expect(paidDuplicates.every((r) => r.status === "paid" && r.reasonCode === "duplicate_charge")).toBe(true);
  });

  it("lists refunds with the IBAN masked", async () => {
    const approver = await signInAs("approver");
    const rows = await listRefunds({ ...approver });
    expect(rows.length).toBeGreaterThanOrEqual(SEED_REFUNDS.length);
    const dump = JSON.stringify(rows);
    for (const r of SEED_REFUNDS) expect(dump).not.toContain(r.destinationIban);
  });
});

describe("four-eyes approval", () => {
  it("blocks self-approval (and self-rejection) and audits the attempt", async () => {
    const id = await requestAs("admin", "50");
    for (const decision of ["approve", "reject"] as const) {
      const result = await decideAs("admin", id, decision);
      expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/another approver/) });
      const event = (await lastAuditEvent({ action: `refund.${decision}`, resourceId: id }))!;
      expect(event).toMatchObject({ outcome: "denied", actorEmail: "adam.admin@example.com" });
      expect(JSON.parse(event.metadata!)).toEqual({ reason: "self_approval" });
    }
    expect(await refund(id)).toMatchObject({ status: "requested", decisions: [] });

    expect(await decideAs("approver", id, "approve")).toMatchObject({ ok: true, message: "Refund approved." });
    expect((await refund(id)).status).toBe("approved");
  });

  it("below the threshold, one approval approves", async () => {
    const id = await requestAs("operator", "499.99");
    expect((await refund(id)).requiredApprovals).toBe(1);
    await decideAs("approver", id, "approve");
    expect((await refund(id)).status).toBe("approved");
  });

  it.each(["500", "1250"])("at/above the threshold (%s), a second approval from a different approver is required", async (amount) => {
    const id = await requestAs("operator", amount);
    expect((await refund(id)).requiredApprovals).toBe(2);

    expect(await decideAs("approver", id, "approve")).toMatchObject({ ok: true, message: expect.stringMatching(/1 of 2/) });
    expect(await refund(id)).toMatchObject({ status: "requested", decisions: [expect.anything()] });

    expect(await decideAs("admin", id, "approve")).toMatchObject({ ok: true, message: "Refund approved." });
    expect((await refund(id)).status).toBe("approved");
  });

  it("the same approver can't approve twice", async () => {
    const id = await requestAs("operator", "900");
    await decideAs("approver", id, "approve");
    const again = await decideAs("approver", id, "approve");
    expect(again).toMatchObject({ ok: false, message: expect.stringMatching(/already decided/) });
    expect(await refund(id)).toMatchObject({ status: "requested", decisions: [expect.anything()] });
    const event = (await lastAuditEvent({ action: "refund.approve", resourceId: id }))!;
    expect(event).toMatchObject({ outcome: "denied", actorEmail: "april.approver@example.com" });
    expect(JSON.parse(event.metadata!)).toEqual({ reason: "already_decided" });
  });

  it("the DB rejects a duplicate decision even if the check is bypassed", async () => {
    const id = await requestAs("operator", "900");
    await decideAs("approver", id, "approve");
    const approver = await db.user.findUniqueOrThrow({ where: { externalId: USERS.approver } });
    await expect(db.refundDecision.create({ data: { refundId: id, approverId: approver.id, decision: "approve" } })).rejects.toThrow();
  });

  describe("with a configured threshold", () => {
    const original = process.env.REFUND_DUAL_APPROVAL_THRESHOLD;
    afterEach(() => {
      if (original === undefined) delete process.env.REFUND_DUAL_APPROVAL_THRESHOLD;
      else process.env.REFUND_DUAL_APPROVAL_THRESHOLD = original;
    });

    it("uses REFUND_DUAL_APPROVAL_THRESHOLD, fixed at request time", async () => {
      process.env.REFUND_DUAL_APPROVAL_THRESHOLD = "100";
      const id = await requestAs("operator", "150");
      expect((await refund(id)).requiredApprovals).toBe(2);
      delete process.env.REFUND_DUAL_APPROVAL_THRESHOLD;
      await decideAs("approver", id, "approve");
      expect((await refund(id)).status).toBe("requested");
    });
  });

  it("a single rejection rejects, after which no more decisions are accepted", async () => {
    const id = await requestAs("operator", "800");
    await decideAs("approver", id, "approve");
    expect(await decideAs("admin", id, "reject", "Not eligible")).toMatchObject({ ok: true, message: "Refund rejected." });
    expect(await refund(id)).toMatchObject({ status: "rejected" });
    expect(await decideAs("admin", id, "approve")).toMatchObject({ ok: false, message: expect.stringMatching(/no longer/) });
  });
});

describe("payment", () => {
  it("only approved refunds can be marked paid, by operators/admins", async () => {
    const id = await requestAs("operator", "20");
    await signInAs("operator");
    expect(await markRefundPaid(initial, form({ id }))).toMatchObject({ ok: false, message: expect.stringMatching(/approved/) });
    await decideAs("approver", id, "approve");
    expect(await markRefundPaid(initial, form({ id }))).toMatchObject({ ok: false, message: expect.stringMatching(/permission/) });
    await signInAs("operator");
    expect(await markRefundPaid(initial, form({ id }))).toMatchObject({ ok: true });
    expect((await refund(id)).status).toBe("paid");
    expect(await markRefundPaid(initial, form({ id }))).toMatchObject({ ok: false });
  });
});

describe("refund audit trail", () => {
  it("records every state change with before and after, in order", async () => {
    const id = await requestAs("operator", "600");
    await decideAs("approver", id, "approve", "Looks right");
    await decideAs("admin", id, "approve");
    await signInAs("operator");
    await markRefundPaid(initial, form({ id }));

    const trail = await getRefundAuditTrail(id);
    expect(trail.map((e) => [e.action, e.actorEmail])).toEqual([
      ["refund.request", "oscar.operator@example.com"],
      ["refund.approve", "april.approver@example.com"],
      ["refund.approve", "adam.admin@example.com"],
      ["refund.pay", "oscar.operator@example.com"],
    ]);
    const states = trail.map((e) => [e.before && JSON.parse(e.before), JSON.parse(e.after!)]);
    expect(states[1]).toEqual([
      { status: "requested", requiredApprovals: 2, approvedBy: [], rejectedBy: [] },
      { status: "requested", requiredApprovals: 2, approvedBy: ["april.approver@example.com"], rejectedBy: [] },
    ]);
    expect(states[2]).toEqual([
      { status: "requested", requiredApprovals: 2, approvedBy: ["april.approver@example.com"], rejectedBy: [] },
      { status: "approved", requiredApprovals: 2, approvedBy: ["april.approver@example.com", "adam.admin@example.com"], rejectedBy: [] },
    ]);
    expect(JSON.parse(trail[1].metadata!)).toEqual({ note: "Looks right" });
    expect(states[3]).toEqual([{ status: "approved" }, { status: "paid" }]);
  });

  it("never stores a plaintext refund IBAN in the audit log", async () => {
    const ibans = (await db.refund.findMany()).map((r) => r.destinationIban);
    const dump = JSON.stringify(await db.auditEvent.findMany());
    for (const iban of ibans) expect(dump).not.toContain(iban);
  });
});

describe("refund seed data", () => {
  it("is consistent with the rules", async () => {
    const seeded = await db.refund.findMany({ where: { id: { startsWith: "seed-refund-" } }, include: { decisions: true } });
    expect(seeded).toHaveLength(SEED_REFUNDS.length);
    expect(new Set(seeded.map((r) => r.status))).toEqual(new Set(["requested", "approved", "rejected", "paid"]));
    expect(new Set(seeded.map((r) => r.requiredApprovals))).toEqual(new Set([1, 2]));
    expect(new Set(seeded.map((r) => r.reasonCode))).toEqual(new Set([...REFUND_REASON_CODES, null]));
    for (const r of seeded) {
      expect(isValidIban(r.destinationIban)).toBe(true);
      if (reasonCodeRequired(r.amountMinor)) expect(r.reasonCode).not.toBeNull();
      expect(r.decisions.map((d) => d.approverId)).not.toContain(r.requestedById);
      const approvals = r.decisions.filter((d) => d.decision === "approve").length;
      const rejected = r.decisions.some((d) => d.decision === "reject");
      if (r.status === "approved" || r.status === "paid") expect(approvals).toBeGreaterThanOrEqual(r.requiredApprovals);
      if (r.status === "requested") expect(approvals < r.requiredApprovals && !rejected).toBe(true);
      expect(r.status === "rejected").toBe(rejected);
    }
  });
});
