import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditTrail } from "@/apps/refunds/components/AuditTrail";
import { MarkPaidForm } from "@/apps/refunds/components/MarkPaidForm";
import { RefundDecisionForm } from "@/apps/refunds/components/RefundDecisionForm";
import { StatusBadge } from "@/apps/refunds/components/StatusBadge";
import { getRefund, getRefundAuditTrail } from "@/apps/refunds/data";
import { DECISION_BLOCK_MESSAGES, REASON_CODE_LABELS, checkDecision, formatAmount, isReasonCode } from "@/apps/refunds/policy";
import { refundResource } from "@/apps/refunds/sensitive";
import { SensitiveValue } from "@/platform/masking/client";
import { canUnmask } from "@/platform/masking/server";
import { hasPermission, requirePermission } from "@/platform/permissions";
import { PageHeader } from "@/platform/shell";

const card = "rounded-lg border border-slate-200 bg-white p-4 shadow-sm";

export default async function RefundPage({ params }: PageProps<"/apps/refunds/[id]">) {
  const user = await requirePermission("refunds:read");
  const { id } = await params;
  const refund = await getRefund(user, id);
  if (!refund) notFound();
  const trail = await getRefundAuditTrail(id);

  const approvals = refund.decisions.filter((d) => d.decision === "approve").length;
  const decisionCheck = checkDecision(refund, refund.decisions, user.id);
  const canDecide = hasPermission(user, "refunds:approve");
  const canPay = hasPermission(user, "refunds:pay") && refund.status === "approved";

  return (
    <>
      <Link href="/apps/refunds" className="text-sm text-slate-600 hover:underline">
        ← All refunds
      </Link>
      <PageHeader title={`${formatAmount(refund.amountMinor, refund.currency)} to ${refund.customer.name}`} description={refund.reason}>
        <StatusBadge status={refund.status} />
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-3 font-medium">Details</h2>
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="text-slate-500">Customer</dt>
            <dd className="col-span-2">{refund.customer.name}</dd>
            <dt className="text-slate-500">Amount</dt>
            <dd className="col-span-2 font-mono">{formatAmount(refund.amountMinor, refund.currency)}</dd>
            <dt className="text-slate-500">Reason code</dt>
            <dd className="col-span-2">{isReasonCode(refund.reasonCode) ? REASON_CODE_LABELS[refund.reasonCode] : "—"}</dd>
            <dt className="text-slate-500">Destination IBAN</dt>
            <dd className="col-span-2">
              <SensitiveValue field={refund.destinationIban} canReveal={canUnmask(user, refundResource, "destinationIban")} />
            </dd>
            <dt className="text-slate-500">Status</dt>
            <dd className="col-span-2">
              <StatusBadge status={refund.status} />
            </dd>
            <dt className="text-slate-500">Requested by</dt>
            <dd className="col-span-2">
              {refund.requestedBy.name} <span className="text-slate-500">({refund.requestedBy.email})</span>
            </dd>
            <dt className="text-slate-500">Requested</dt>
            <dd className="col-span-2">{refund.createdAt.toISOString()}</dd>
          </dl>
        </section>
        <section className={card}>
          <h2 className="mb-1 font-medium">Approvals</h2>
          <p className="mb-3 text-sm text-slate-600">
            {approvals} of {refund.requiredApprovals} required approval{refund.requiredApprovals === 1 ? "" : "s"}
            {refund.requiredApprovals > 1 && " (from different approvers)"}.
          </p>
          {refund.decisions.length > 0 && (
            <ul className="mb-4 space-y-2 text-sm">
              {refund.decisions.map((d) => (
                <li key={d.id} className="rounded border border-slate-200 p-2">
                  <span className={d.decision === "approve" ? "text-green-700" : "text-red-700"}>
                    {d.decision === "approve" ? "Approved" : "Rejected"}
                  </span>{" "}
                  by {d.approver.name} <span className="text-xs text-slate-500">{d.createdAt.toISOString().replace("T", " ").slice(0, 16)} UTC</span>
                  {d.note && <p className="mt-1 text-slate-600">{d.note}</p>}
                </li>
              ))}
            </ul>
          )}
          {canDecide &&
            (decisionCheck.ok ? (
              <RefundDecisionForm refundId={refund.id} />
            ) : (
              refund.status === "requested" && <p className="text-sm text-slate-600">{DECISION_BLOCK_MESSAGES[decisionCheck.reason]}</p>
            ))}
          {canPay && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <MarkPaidForm refundId={refund.id} />
            </div>
          )}
        </section>
      </div>
      <section className={`${card} mt-6`}>
        <h2 className="mb-3 font-medium">Audit trail</h2>
        <AuditTrail events={trail} />
      </section>
    </>
  );
}
