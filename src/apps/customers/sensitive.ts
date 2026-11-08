import { db } from "@/platform/db";
import { defineSensitiveResource, masks } from "@/platform/masking";

export const customerResource = defineSensitiveResource({
  type: "customer",
  fields: {
    iban: { label: "IBAN", mask: masks.iban, unmaskPermission: "customers:unmask_iban" },
  },
  load: (id: string) => db.customer.findUnique({ where: { id } }),
});
