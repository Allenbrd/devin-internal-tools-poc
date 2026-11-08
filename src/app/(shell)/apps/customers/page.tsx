import Link from "next/link";
import { listCustomers } from "@/apps/customers/data";
import { customerResource } from "@/apps/customers/sensitive";
import { canUnmask } from "@/platform/masking/server";
import { SensitiveValue } from "@/platform/masking/client";
import { requirePermission } from "@/platform/permissions";
import { PageHeader } from "@/platform/shell";

export default async function CustomersPage() {
  const user = await requirePermission("customers:read");
  const customers = await listCustomers(user);
  const canRevealIban = canUnmask(user, customerResource, "iban");

  return (
    <>
      <PageHeader title="Customer Directory" description="Sample app. IBANs are masked; revealing one is permissioned and audited." />
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">IBAN</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {customers.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2">
                  <Link href={`/apps/customers/${c.id}`} className="font-medium text-slate-900 underline-offset-2 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-600">{c.email}</td>
                <td className="px-4 py-2">
                  <SensitiveValue field={c.iban} canReveal={canRevealIban} />
                </td>
                <td className="px-4 py-2 capitalize">{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
