import Link from "next/link";
import { StatusBadge } from "@/apps/refunds/components/StatusBadge";
import { listRefunds, type RefundFilters } from "@/apps/refunds/data";
import { REASON_CODE_LABELS, REFUND_REASON_CODES, REFUND_STATUSES, formatAmount, isReasonCode, type RefundStatus } from "@/apps/refunds/policy";
import { refundResource } from "@/apps/refunds/sensitive";
import { SensitiveValue } from "@/platform/masking/client";
import { canUnmask } from "@/platform/masking/server";
import { hasPermission, requirePermission } from "@/platform/permissions";
import { PageHeader } from "@/platform/shell";

const isStatus = (v: unknown): v is RefundStatus => typeof v === "string" && (REFUND_STATUSES as readonly string[]).includes(v);

export default async function RefundsPage({ searchParams }: PageProps<"/apps/refunds">) {
  const user = await requirePermission("refunds:read");
  const { status: rawStatus, reasonCode: rawReasonCode } = await searchParams;
  const status = isStatus(rawStatus) ? rawStatus : undefined;
  const reasonCode = isReasonCode(rawReasonCode) || rawReasonCode === "none" ? rawReasonCode : undefined;
  const refunds = await listRefunds(user, { status, reasonCode });
  const canRevealIban = canUnmask(user, refundResource, "destinationIban");

  const filterHref = (filters: RefundFilters) => {
    const query = new URLSearchParams(Object.entries(filters).filter((e): e is [string, string] => !!e[1])).toString();
    return query ? `/apps/refunds?${query}` : "/apps/refunds";
  };

  const filterClass = (active: boolean) =>
    `rounded px-2 py-1 ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`;

  return (
    <>
      <PageHeader title="Refunds" description="Operators request refunds; approvers approve or reject them. Nobody approves their own request.">
        {hasPermission(user, "refunds:create") && (
          <Link href="/apps/refunds/new" className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
            New refund
          </Link>
        )}
      </PageHeader>
      <nav aria-label="Filter by status" className="mb-2 flex gap-2 text-sm">
        <Link href={filterHref({ reasonCode })} className={filterClass(!status)}>
          All
        </Link>
        {REFUND_STATUSES.map((s) => (
          <Link key={s} href={filterHref({ status: s, reasonCode })} className={`capitalize ${filterClass(status === s)}`}>
            {s}
          </Link>
        ))}
      </nav>
      <nav aria-label="Filter by reason code" className="mb-4 flex gap-2 text-sm">
        <Link href={filterHref({ status })} className={filterClass(!reasonCode)}>
          All reasons
        </Link>
        {REFUND_REASON_CODES.map((c) => (
          <Link key={c} href={filterHref({ status, reasonCode: c })} className={filterClass(reasonCode === c)}>
            {REASON_CODE_LABELS[c]}
          </Link>
        ))}
        <Link href={filterHref({ status, reasonCode: "none" })} className={filterClass(reasonCode === "none")}>
          No reason code
        </Link>
      </nav>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2">Reason code</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Approvals</th>
              <th className="px-4 py-2">Destination IBAN</th>
              <th className="px-4 py-2">Requested by</th>
              <th className="px-4 py-2">Requested</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {refunds.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">
                  <Link href={`/apps/refunds/${r.id}`} className="font-medium text-slate-900 underline-offset-2 hover:underline">
                    {r.customer.name}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono">{formatAmount(r.amountMinor, r.currency)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{isReasonCode(r.reasonCode) ? REASON_CODE_LABELS[r.reasonCode] : "—"}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {r.decisions.filter((d) => d.decision === "approve").length} / {r.requiredApprovals}
                </td>
                <td className="px-4 py-2">
                  <SensitiveValue field={r.destinationIban} canReveal={canRevealIban} />
                </td>
                <td className="px-4 py-2 text-slate-600">{r.requestedBy.name}</td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{r.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
            {refunds.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  No refunds.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
