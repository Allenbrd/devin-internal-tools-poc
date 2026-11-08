import { describe, expect, it } from "vitest";
import { updateCustomer } from "@/apps/customers/actions";
import { getCustomer, listCustomers } from "@/apps/customers/data";
import { recordAudit } from "@/platform/audit";
import { AppendOnlyViolationError, db } from "@/platform/db";
import { anyCustomer, form, lastAuditEvent, signInAs } from "./support/helpers";

const actor = { id: "a1", email: "auditor@example.com", role: "admin" };

describe("audit log is append-only", () => {
  it("blocks update/delete through the Prisma client", async () => {
    await recordAudit({ actor, action: "test.event" });
    const event = (await lastAuditEvent({ action: "test.event" }))!;
    const attempts = [
      () => db.auditEvent.update({ where: { id: event.id }, data: { action: "tampered" } }),
      () => db.auditEvent.updateMany({ data: { action: "tampered" } }),
      () => db.auditEvent.upsert({ where: { id: event.id }, update: { action: "x" }, create: { ...event } }),
      () => db.auditEvent.delete({ where: { id: event.id } }),
      () => db.auditEvent.deleteMany({}),
    ];
    for (const attempt of attempts) await expect(attempt()).rejects.toBeInstanceOf(AppendOnlyViolationError);
    expect(await db.auditEvent.findUnique({ where: { id: event.id } })).toMatchObject({ action: "test.event" });
  });

  it("blocks update/delete at the database level (triggers)", async () => {
    const event = (await lastAuditEvent({ action: "test.event" }))!;
    await expect(db.$executeRawUnsafe(`UPDATE "AuditEvent" SET "action" = 'tampered' WHERE "id" = '${event.id}'`)).rejects.toThrow(
      /append-only/,
    );
    await expect(db.$executeRawUnsafe(`DELETE FROM "AuditEvent" WHERE "id" = '${event.id}'`)).rejects.toThrow(/append-only/);
    expect(await db.auditEvent.findUnique({ where: { id: event.id } })).toMatchObject({ action: "test.event" });
  });
});

describe("audit redaction", () => {
  it("masks declared sensitive fields and scrubs IBAN/card patterns everywhere", async () => {
    await recordAudit({
      actor,
      action: "test.redaction",
      resource: { type: "customer", id: "c1" },
      before: { iban: "DE89370400440532013000", name: "Contoso" },
      after: { iban: "GB82WEST12345698765432", nested: [{ note: "paid from NL91 ABNA 0417 1643 00" }] },
      metadata: { comment: "card 4111 1111 1111 1111 used" },
    });
    const event = (await lastAuditEvent({ action: "test.redaction" }))!;
    expect(JSON.parse(event.before!)).toEqual({ iban: "****3000", name: "Contoso" });
    expect(JSON.parse(event.after!)).toEqual({ iban: "****5432", nested: [{ note: "paid from ****4300" }] });
    expect(JSON.parse(event.metadata!)).toEqual({ comment: "card ****1111 used" });
  });
});

describe("audit on write", () => {
  it("records who changed what with masked before/after, atomically with the change", async () => {
    const customer = await anyCustomer();
    const operator = await signInAs("operator");

    const result = await updateCustomer(
      { ok: false },
      form({ id: customer.id, name: `${customer.name} (edited)`, status: "suspended", iban: "NL91 ABNA 0417 1643 00" }),
    );
    expect(result).toMatchObject({ ok: true });

    const updated = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(updated).toMatchObject({ status: "suspended", iban: "NL91ABNA0417164300" });

    const event = (await lastAuditEvent({ action: "customer.update", resourceId: customer.id }))!;
    expect(event).toMatchObject({ actorId: operator.id, actorEmail: operator.email, actorRole: "operator", resourceType: "customer" });
    expect(JSON.parse(event.before!)).toEqual({ name: customer.name, status: customer.status, iban: `****${customer.iban.slice(-4)}` });
    expect(JSON.parse(event.after!)).toEqual({ name: `${customer.name} (edited)`, status: "suspended", iban: "****4300" });
    expect(event.before).not.toContain(customer.iban);
    expect(event.after).not.toContain("NL91ABNA0417164300");
  });

  it("rejects writes without permission, leaves data untouched and audits the denial", async () => {
    const customer = await anyCustomer();
    await signInAs("approver");
    const result = await updateCustomer({ ok: false }, form({ id: customer.id, name: "Hacked", status: "closed", iban: "" }));
    expect(result.ok).toBe(false);
    expect(await db.customer.findUniqueOrThrow({ where: { id: customer.id } })).toMatchObject({ name: customer.name });
    expect(await lastAuditEvent()).toMatchObject({ action: "access.denied", actorEmail: "april.approver@example.com" });
  });

  it("validates input (invalid IBAN is rejected and nothing is written)", async () => {
    const customer = await anyCustomer();
    await signInAs("operator");
    const before = await db.auditEvent.count();
    const result = await updateCustomer({ ok: false }, form({ id: customer.id, name: "X", status: "active", iban: "GB00BAD" }));
    expect(result.errors?.iban).toBeDefined();
    expect(await db.auditEvent.count()).toBe(before);
  });
});

describe("audit on read of sensitive fields", () => {
  it("records a sensitive.read event when a record with sensitive fields is viewed", async () => {
    const customer = await anyCustomer();
    const viewer = await signInAs("viewer");
    const view = await getCustomer({ ...viewer }, customer.id);
    expect(view?.iban.display).toMatch(/^\*{4}\w{4}$/);

    const event = (await lastAuditEvent({ action: "sensitive.read", resourceId: customer.id }))!;
    expect(event).toMatchObject({ actorEmail: viewer.email, resourceType: "customer" });
    expect(JSON.parse(event.metadata!)).toEqual({ fields: ["iban"], masked: true });
  });

  it("records one event listing the record ids for list views", async () => {
    const viewer = await signInAs("viewer");
    const rows = await listCustomers({ ...viewer });
    const event = (await lastAuditEvent({ action: "sensitive.read", actorEmail: viewer.email }))!;
    expect(JSON.parse(event.metadata!).recordIds).toEqual(rows.map((r) => r.id));
  });
});
