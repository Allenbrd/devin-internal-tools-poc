import { PrismaClient } from "@prisma/client";

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
    console.log(`Seeded ${SEED_USERS.length} users and ${SEED_CUSTOMERS.length} customers.`);
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
