import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerEditForm } from "@/apps/customers/components/CustomerEditForm";
import { CUSTOMER_STATUSES, getCustomer } from "@/apps/customers/data";
import { customerResource } from "@/apps/customers/sensitive";
import { canUnmask } from "@/platform/masking/server";
import { SensitiveValue } from "@/platform/masking/client";
import { hasPermission, requirePermission } from "@/platform/permissions";
import { PageHeader } from "@/platform/shell";

export default async function CustomerPage({ params }: PageProps<"/apps/customers/[id]">) {
  const user = await requirePermission("customers:read");
  const { id } = await params;
  const customer = await getCustomer(user, id);
  if (!customer) notFound();

  return (
    <>
      <Link href="/apps/customers" className="text-sm text-slate-600 hover:underline">
        ← All customers
      </Link>
      <PageHeader title={customer.name} description={customer.email} />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-medium">Details</h2>
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="text-slate-500">IBAN</dt>
            <dd className="col-span-2">
              <SensitiveValue field={customer.iban} canReveal={canUnmask(user, customerResource, "iban")} />
            </dd>
            <dt className="text-slate-500">Status</dt>
            <dd className="col-span-2 capitalize">{customer.status}</dd>
            <dt className="text-slate-500">Updated</dt>
            <dd className="col-span-2">{customer.updatedAt.toISOString()}</dd>
          </dl>
        </section>
        {hasPermission(user, "customers:update") && (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-medium">Edit</h2>
            <CustomerEditForm
              customer={{ id: customer.id, name: customer.name, status: customer.status }}
              statuses={CUSTOMER_STATUSES}
            />
          </section>
        )}
      </div>
    </>
  );
}
