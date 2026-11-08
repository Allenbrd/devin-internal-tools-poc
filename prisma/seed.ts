import { PrismaClient } from "@prisma/client";
import { requiredApprovalsFor } from "../src/apps/refunds/policy";

export const SEED_USERS = [
  { externalId: "mock|vera", name: "Vera Viewer", email: "vera.viewer@example.com", role: "viewer" },
  { externalId: "mock|oscar", name: "Oscar Operator", email: "oscar.operator@example.com", role: "operator" },
  { externalId: "mock|april", name: "April Approver", email: "april.approver@example.com", role: "approver" },
  { externalId: "mock|adam", name: "Adam Admin", email: "adam.admin@example.com", role: "admin" },
] as const;

// Example IBANs from public documentation / test ranges, not real accounts.
export const SEED_CUSTOMERS = [
  { name: "Northwind Traders Ltd", email: "billing@northwind.example", iban: "GB82WEST12345698765432", status: "active" },
  { name: "Contoso GmbH", email: "finance@contoso.example", iban: "DE89370400440532013000", status: "active" },
  { name: "Fabrikam SARL", email: "compta@fabrikam.example", iban: "FR1420041010050500013M02606", status: "suspended" },
  { name: "Tailspin Toys BV", email: "ap@tailspin.example", iban: "NL91ABNA0417164300", status: "active" },
  { name: "Adventure Works SL", email: "pagos@adventure-works.example", iban: "ES9121000418450200051332", status: "closed" },
] as const;

type SeedUserKey = (typeof SEED_USERS)[number]["externalId"];
type SeedCustomerEmail = (typeof SEED_CUSTOMERS)[number]["email"];

interface SeedRefund {
  id: string;
  customer: SeedCustomerEmail;
  amountMinor: number;
  currency: "EUR" | "GBP" | "USD" | "CHF";
  reason: string;
  destinationIban: string;
  status: "requested" | "approved" | "rejected" | "paid";
  requestedBy: SeedUserKey;
  decisions?: { by: SeedUserKey; decision: "approve" | "reject"; note?: string }[];
}

// Spread across statuses and both sides of the default 500 dual-approval threshold.
// IBANs are published example/test numbers with valid checksums, not real accounts.
export const SEED_REFUNDS: SeedRefund[] = [
  { id: "seed-refund-01", customer: "billing@northwind.example", amountMinor: 6000, currency: "CHF", reason: "Shipping fee charged twice", destinationIban: "CH9300762011623852957", status: "requested", requestedBy: "mock|adam" },
  { id: "seed-refund-02", customer: "finance@contoso.example", amountMinor: 8950, currency: "EUR", reason: "Damaged item returned", destinationIban: "DE75512108001245126199", status: "approved", requestedBy: "mock|oscar", decisions: [{ by: "mock|april", decision: "approve" }] },
  { id: "seed-refund-03", customer: "compta@fabrikam.example", amountMinor: 75000, currency: "EUR", reason: "Annual plan cancelled within cooling-off period", destinationIban: "FR7630006000011234567890189", status: "requested", requestedBy: "mock|oscar", decisions: [{ by: "mock|april", decision: "approve", note: "Contract checked" }] },
  { id: "seed-refund-04", customer: "ap@tailspin.example", amountMinor: 125000, currency: "EUR", reason: "Bulk order short-shipped", destinationIban: "NL02ABNA0123456789", status: "requested", requestedBy: "mock|oscar" },
  { id: "seed-refund-05", customer: "pagos@adventure-works.example", amountMinor: 49999, currency: "EUR", reason: "Service outage credit", destinationIban: "ES7921000813610123456789", status: "requested", requestedBy: "mock|oscar" },
  { id: "seed-refund-06", customer: "billing@northwind.example", amountMinor: 50000, currency: "GBP", reason: "Overbilling on October invoice", destinationIban: "GB29NWBK60161331926819", status: "approved", requestedBy: "mock|oscar", decisions: [{ by: "mock|april", decision: "approve" }, { by: "mock|adam", decision: "approve" }] },
  { id: "seed-refund-07", customer: "finance@contoso.example", amountMinor: 240000, currency: "USD", reason: "Duplicate payment of invoice INV-1042", destinationIban: "BE71096123456769", status: "paid", requestedBy: "mock|oscar", decisions: [{ by: "mock|april", decision: "approve" }, { by: "mock|adam", decision: "approve" }] },
  { id: "seed-refund-08", customer: "ap@tailspin.example", amountMinor: 4500, currency: "EUR", reason: "Coupon not applied at checkout", destinationIban: "IE64IRCE92050112345678", status: "paid", requestedBy: "mock|oscar", decisions: [{ by: "mock|adam", decision: "approve" }] },
  { id: "seed-refund-09", customer: "compta@fabrikam.example", amountMinor: 31000, currency: "EUR", reason: "Goodwill gesture", destinationIban: "AT483200000012345864", status: "rejected", requestedBy: "mock|oscar", decisions: [{ by: "mock|april", decision: "reject", note: "Duplicate of an earlier request" }] },
  { id: "seed-refund-10", customer: "pagos@adventure-works.example", amountMinor: 98000, currency: "EUR", reason: "Early termination refund", destinationIban: "IT60X0542811101000000123456", status: "rejected", requestedBy: "mock|oscar", decisions: [{ by: "mock|april", decision: "approve" }, { by: "mock|adam", decision: "reject", note: "Contract has no early-termination clause" }] },
];

export const SEED_FLAGS = [
  { key: "new-checkout", description: "Single-page checkout flow", environment: "dev", enabled: true },
  { key: "new-checkout", description: "Single-page checkout flow", environment: "staging", enabled: true },
  { key: "new-checkout", description: "Single-page checkout flow", environment: "prod", enabled: false },
  { key: "dark-mode", description: "Dark theme for the customer portal", environment: "dev", enabled: true },
  { key: "dark-mode", description: "Dark theme for the customer portal", environment: "staging", enabled: false },
  { key: "dark-mode", description: "Dark theme for the customer portal", environment: "prod", enabled: false },
  { key: "search-v2", description: "New search ranking service", environment: "dev", enabled: true },
  { key: "search-v2", description: "New search ranking service", environment: "staging", enabled: true },
  { key: "search-v2", description: "New search ranking service", environment: "prod", enabled: true },
  { key: "legacy-csv-export", description: "Old CSV export endpoint (being retired)", environment: "dev", enabled: false },
  { key: "legacy-csv-export", description: "Old CSV export endpoint (being retired)", environment: "staging", enabled: false },
  { key: "legacy-csv-export", description: "Old CSV export endpoint (being retired)", environment: "prod", enabled: true },
] as const;

/** A prod toggle waiting for an approver, so the approval flow can be tried right away. */
export const SEED_PENDING_REQUEST = {
  key: "new-checkout",
  environment: "prod",
  enabled: true,
  reason: "Staging soak finished, rolling out to prod",
  requestedBy: "mock|oscar",
} as const;

export async function seed(client = new PrismaClient()) {
  try {
    for (const user of SEED_USERS) {
      await client.user.upsert({
        where: { externalId: user.externalId },
        update: { name: user.name, email: user.email, role: user.role, active: true },
        create: user,
      });
    }
    for (const customer of SEED_CUSTOMERS) {
      await client.customer.upsert({
        where: { email: customer.email },
        update: {},
        create: customer,
      });
    }
    const userIds = new Map((await client.user.findMany()).map((u) => [u.externalId, u.id]));
    const customerIds = new Map((await client.customer.findMany()).map((c) => [c.email, c.id]));
    for (const { id, customer, requestedBy, decisions = [], ...refund } of SEED_REFUNDS) {
      await client.refund.upsert({
        where: { id },
        update: {},
        create: {
          id,
          ...refund,
          customerId: customerIds.get(customer)!,
          requestedById: userIds.get(requestedBy)!,
          requiredApprovals: requiredApprovalsFor(refund.amountMinor),
          version: decisions.length + (refund.status === "paid" ? 1 : 0),
          decisions: {
            create: decisions.map((d) => ({ approverId: userIds.get(d.by)!, decision: d.decision, note: d.note })),
          },
        },
      });
    }
    for (const flag of SEED_FLAGS) {
      await client.featureFlag.upsert({
        where: { key_environment: { key: flag.key, environment: flag.environment } },
        update: {},
        create: flag,
      });
    }
    const pending = SEED_PENDING_REQUEST;
    const pendingFlag = await client.featureFlag.findUniqueOrThrow({
      where: { key_environment: { key: pending.key, environment: pending.environment } },
      include: { _count: { select: { changeRequests: true } } },
    });
    // Only on a flag with no history, so re-seeding never re-opens a decided request.
    if (pendingFlag._count.changeRequests === 0 && pendingFlag.enabled !== pending.enabled) {
      const requester = await client.user.findUniqueOrThrow({ where: { externalId: pending.requestedBy } });
      await client.flagChangeRequest.create({
        data: {
          flagId: pendingFlag.id,
          enabled: pending.enabled,
          reason: pending.reason,
          status: "pending",
          pendingFlagId: pendingFlag.id,
          requestedById: requester.id,
          requestedByEmail: requester.email,
        },
      });
    }
    console.log(
      `Seeded ${SEED_USERS.length} users, ${SEED_CUSTOMERS.length} customers, ${SEED_REFUNDS.length} refunds and ${SEED_FLAGS.length} feature flags.`,
    );
  } finally {
    await client.$disconnect();
  }
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/seed.ts");
if (isMain) {
  seed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
