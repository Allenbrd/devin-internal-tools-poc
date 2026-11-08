import Link from "next/link";
import { RefundRequestForm } from "@/apps/refunds/components/RefundRequestForm";
import { listCustomerOptions } from "@/apps/refunds/data";
import { REFUND_CURRENCIES, dualApprovalThresholdMinor } from "@/apps/refunds/policy";
import { requirePermission } from "@/platform/permissions";
import { PageHeader } from "@/platform/shell";

export default async function NewRefundPage() {
  await requirePermission("refunds:create");
  const customers = await listCustomerOptions();
  const threshold = (dualApprovalThresholdMinor() / 100).toLocaleString("en-GB");

  return (
    <>
      <Link href="/apps/refunds" className="text-sm text-slate-600 hover:underline">
        ← All refunds
      </Link>
      <PageHeader title="New refund" description="The request is reviewed by an approver other than you." />
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <RefundRequestForm customers={customers} currencies={REFUND_CURRENCIES} thresholdLabel={threshold} />
      </section>
    </>
  );
}
