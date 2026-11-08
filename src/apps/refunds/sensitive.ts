import { db } from "@/platform/db";
import { defineSensitiveResource, masks } from "@/platform/masking";

export const refundInclude = {
  customer: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true, email: true } },
  decisions: {
    include: { approver: { select: { id: true, name: true, email: true } } },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
};

export const refundResource = defineSensitiveResource({
  type: "refund",
  fields: {
    destinationIban: { label: "Destination IBAN", mask: masks.iban, unmaskPermission: "refunds:unmask_iban" },
  },
  load: (id: string) => db.refund.findUnique({ where: { id }, include: refundInclude }),
});
