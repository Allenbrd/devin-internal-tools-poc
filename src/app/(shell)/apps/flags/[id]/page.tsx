import Link from "next/link";
import { notFound } from "next/navigation";
import { approveProdToggle, rejectProdToggle, requestProdToggle, toggleFlag } from "@/apps/flags/actions";
import { FlagActionForm } from "@/apps/flags/components/FlagActionForm";
import { EnvironmentBadge, FlagState } from "@/apps/flags/components/FlagBadges";
import { FlagHistory } from "@/apps/flags/components/FlagHistory";
import { FLAG_RESOURCE_TYPE, getFlag, getFlagHistory, requiresApproval } from "@/apps/flags/data";
import { hasPermission, requirePermission } from "@/platform/permissions";
import { PageHeader } from "@/platform/shell";

const fmt = (d: Date) => d.toISOString().replace("T", " ").slice(0, 16) + " UTC";

export default async function FlagPage({ params }: PageProps<"/apps/flags/[id]">) {
  const user = await requirePermission("flags:read");
  const { id } = await params;
  const flag = await getFlag(id);
  if (!flag) notFound();
  const history = await getFlagHistory(flag.id);

  const gated = requiresApproval(flag.environment);
  const pending = flag.changeRequests.find((r) => r.status === "pending");
  const canToggle = hasPermission(user, "flags:toggle");
  const canApprove = hasPermission(user, "flags:approve");
  const auditHref = `/admin/audit?${new URLSearchParams({ resourceType: FLAG_RESOURCE_TYPE, resourceId: flag.id })}`;

  return (
    <>
      <Link href="/apps/flags" className="text-sm text-slate-600 hover:underline">
        ← All flags
      </Link>
      <PageHeader title={flag.key} description={flag.description}>
        {hasPermission(user, "audit:read") && (
          <Link href={auditHref} className="text-sm text-slate-700 underline">
            Full audit log
          </Link>
        )}
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-medium">Details</h2>
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="text-slate-500">Environment</dt>
            <dd className="col-span-2">
              <EnvironmentBadge environment={flag.environment} />
            </dd>
            <dt className="text-slate-500">State</dt>
            <dd className="col-span-2">
              <FlagState enabled={flag.enabled} />
            </dd>
            <dt className="text-slate-500">Changes</dt>
            <dd className="col-span-2">{gated ? "Request + approval by someone else" : "Direct toggle by operators"}</dd>
            <dt className="text-slate-500">Updated</dt>
            <dd className="col-span-2">{fmt(flag.updatedAt)}</dd>
          </dl>
        </section>

        {(canToggle || (canApprove && pending)) && (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-medium">{gated ? "Change (needs approval)" : "Toggle"}</h2>
            {!gated && canToggle && (
              <FlagActionForm
                action={toggleFlag}
                fields={{ id: flag.id, enabled: String(!flag.enabled) }}
                label={flag.enabled ? "Turn off" : "Turn on"}
                variant="primary"
              />
            )}
            {gated && pending && (
              <div className="space-y-3 text-sm">
                <p>
                  <span className="font-medium">{pending.requestedByEmail}</span> asked to turn this flag{" "}
                  <strong>{pending.enabled ? "on" : "off"}</strong> on {fmt(pending.createdAt)}: “{pending.reason}”
                </p>
                {canApprove &&
                  (pending.requestedById === user.id ? (
                    <p className="text-slate-500">This is your request: another approver must decide.</p>
                  ) : (
                    <div className="flex gap-2">
                      <FlagActionForm action={approveProdToggle} fields={{ requestId: pending.id }} label="Approve" variant="primary" />
                      <FlagActionForm action={rejectProdToggle} fields={{ requestId: pending.id }} label="Reject" variant="danger" />
                    </div>
                  ))}
                {!canApprove && <p className="text-slate-500">Waiting for an approver.</p>}
              </div>
            )}
            {gated && !pending && canToggle && (
              <FlagActionForm
                action={requestProdToggle}
                fields={{ id: flag.id, enabled: String(!flag.enabled) }}
                label={`Request turn ${flag.enabled ? "off" : "on"}`}
                variant="primary"
                withReason
              />
            )}
          </section>
        )}
      </div>

      {gated && (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-200 px-4 py-3 font-medium">Change requests</h2>
          {flag.changeRequests.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">No requests yet.</p>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Requested</th>
                  <th className="px-4 py-2">Change</th>
                  <th className="px-4 py-2">Reason</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {flag.changeRequests.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2">
                      {r.requestedByEmail}
                      <span className="block text-xs text-slate-500">{fmt(r.createdAt)}</span>
                    </td>
                    <td className="px-4 py-2">turn {r.enabled ? "on" : "off"}</td>
                    <td className="px-4 py-2 text-slate-600">{r.reason}</td>
                    <td className="px-4 py-2">
                      <span className="capitalize">{r.status}</span>
                      {r.decidedByEmail && r.decidedAt && (
                        <span className="block text-xs text-slate-500">
                          by {r.decidedByEmail}, {fmt(r.decidedAt)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
      <section className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-200 px-4 py-3 font-medium">History</h2>
        <FlagHistory events={history} />
      </section>
    </>
  );
}
