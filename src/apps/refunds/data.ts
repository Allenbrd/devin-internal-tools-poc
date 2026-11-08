import "server-only";
import { listAuditEvents } from "@/platform/audit";
import type { Principal } from "@/platform/auth";
import { db } from "@/platform/db";
import { readMasked, readMaskedList } from "@/platform/masking/server";
import type { RefundReasonCode, RefundStatus } from "./policy";
import { refundInclude, refundResource } from "./sensitive";

export interface RefundFilters {
  status?: RefundStatus;
  /** "none" matches refunds without a reason code. */
  reasonCode?: RefundReasonCode | "none";
}

/** Refunds (newest first) with the destination IBAN masked; audited as a sensitive read. */
export async function listRefunds(actor: Principal, { status, reasonCode }: RefundFilters = {}) {
  const refunds = await db.refund.findMany({
    where: {
      ...(status && { status }),
      ...(reasonCode && { reasonCode: reasonCode === "none" ? null : reasonCode }),
    },
    include: refundInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return readMaskedList(actor, refundResource, refunds);
}

export async function getRefund(actor: Principal, id: string) {
  const refund = await db.refund.findUnique({ where: { id }, include: refundInclude });
  return refund ? readMasked(actor, refundResource, refund) : null;
}

/** State changes of one refund ("refund.*" audit events), oldest first. */
export async function getRefundAuditTrail(id: string) {
  const { events } = await listAuditEvents({ resourceType: refundResource.type, resourceId: id, action: "refund." });
  return events.reverse();
}

export function listCustomerOptions() {
  return db.customer.findMany({ where: { status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}
