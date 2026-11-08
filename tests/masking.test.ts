import { describe, expect, it } from "vitest";
import { customerResource } from "@/apps/customers/sensitive";
import { db } from "@/platform/db";
import { maskLast4, maskRecord, scrubSensitivePatterns } from "@/platform/masking";
import { revealSensitiveField } from "@/platform/masking/actions";
import { SEED_CUSTOMERS } from "../prisma/seed";
import { anyCustomer, lastAuditEvent, signInAs } from "./support/helpers";

describe("masks", () => {
  it("shows only the last 4 characters", () => {
    expect(maskLast4("GB82WEST12345698765432")).toBe("****5432");
    expect(maskLast4("GB82 WEST 1234 5698 7654 32")).toBe("****5432");
  });

  it("fully masks values too short to reveal 4 characters safely", () => {
    expect(maskLast4("1234567")).toBe("********");
    expect(maskLast4("")).toBe("********");
  });

  it("scrubs IBAN and card patterns from free text", () => {
    expect(scrubSensitivePatterns("to DE89 3704 0044 0532 0130 00 now")).toBe("to ****3000 now");
    expect(scrubSensitivePatterns("pan 5555-5555-5555-4444")).toBe("pan ****4444");
    expect(scrubSensitivePatterns("order 12345 on 2026-11-08")).toBe("order 12345 on 2026-11-08");
  });

  it("masks sensitive fields by default and never includes the plaintext", () => {
    const record = { id: "c1", name: "Contoso", iban: "DE89370400440532013000" };
    const masked = maskRecord(customerResource as never, record) as unknown as Record<string, unknown>;
    expect(masked.iban).toEqual({
      kind: "masked",
      resource: "customer",
      recordId: "c1",
      field: "iban",
      label: "IBAN",
      display: "****3000",
    });
    expect(JSON.stringify(masked)).not.toContain(record.iban);
  });
});

describe("unmasking", () => {
  it("requires a session", async () => {
    const customer = await anyCustomer();
    expect(await revealSensitiveField({ resource: "customer", recordId: customer.id, field: "iban" })).toEqual({
      ok: false,
      error: "unauthenticated",
    });
  });

  it.each(["viewer", "operator"] as const)("is denied to %s and the denial is audited", async (role) => {
    const customer = await anyCustomer();
    const user = await signInAs(role);
    expect(await revealSensitiveField({ resource: "customer", recordId: customer.id, field: "iban" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    const event = (await lastAuditEvent({ actorEmail: user.email }))!;
    expect(event).toMatchObject({ action: "access.denied", outcome: "denied" });
    expect(JSON.parse(event.metadata!)).toEqual({ permission: "customers:unmask_iban" });
  });

  it.each(["approver", "admin"] as const)("returns the plaintext to %s and audits it without the value", async (role) => {
    const customer = await anyCustomer();
    const user = await signInAs(role);
    expect(await revealSensitiveField({ resource: "customer", recordId: customer.id, field: "iban" })).toEqual({
      ok: true,
      value: customer.iban,
    });
    const event = (await lastAuditEvent({ action: "sensitive.unmask", resourceId: customer.id }))!;
    expect(event).toMatchObject({ actorEmail: user.email, actorRole: role, resourceType: "customer", outcome: "success" });
    expect(JSON.parse(event.metadata!)).toEqual({ field: "iban" });
    expect(JSON.stringify(event)).not.toContain(customer.iban);
  });

  it("refuses fields that are not declared sensitive and unknown resources", async () => {
    const customer = await anyCustomer();
    await signInAs("admin");
    for (const input of [
      { resource: "customer", recordId: customer.id, field: "email" },
      { resource: "customer", recordId: customer.id, field: "__proto__" },
      { resource: "user", recordId: customer.id, field: "role" },
    ]) {
      expect(await revealSensitiveField(input)).toEqual({ ok: false, error: "not_found" });
    }
    expect(await revealSensitiveField({ resource: "", recordId: "", field: "" })).toEqual({ ok: false, error: "invalid" });
  });
});

describe("audit log invariant", () => {
  it("never stores a plaintext IBAN anywhere in the audit log", async () => {
    const ibans = [...SEED_CUSTOMERS.map((c) => c.iban), ...(await db.customer.findMany()).map((c) => c.iban)];
    const events = await db.auditEvent.findMany();
    expect(events.length).toBeGreaterThan(0);
    const dump = JSON.stringify(events);
    for (const iban of ibans) expect(dump).not.toContain(iban);
  });
});
