import Link from "next/link";
import { approveProdToggle, rejectProdToggle, toggleFlag } from "@/apps/flags/actions";
import { FlagActionForm } from "@/apps/flags/components/FlagActionForm";
import { EnvironmentBadge, FlagState } from "@/apps/flags/components/FlagBadges";
import { FLAG_ENVIRONMENTS, isFlagEnvironment, listFlags, listPendingRequests, requiresApproval } from "@/apps/flags/data";
import { hasPermission, requirePermission } from "@/platform/permissions";
import { PageHeader } from "@/platform/shell";

export default async function FlagsPage({ searchParams }: PageProps<"/apps/flags">) {
  const user = await requirePermission("flags:read");
  const { env } = await searchParams;
  const environment = isFlagEnvironment(env) ? env : undefined;
  const [flags, pendingRequests] = await Promise.all([listFlags({ environment }), listPendingRequests()]);
  const canToggle = hasPermission(user, "flags:toggle");
  const canApprove = hasPermission(user, "flags:approve");

  const tabClass = (active: boolean) =>
    `rounded px-3 py-1 ${active ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`;

  return (
    <>
      <PageHeader
        title="Feature Flags"
        description="Operators toggle dev and staging directly. Prod toggles are requested and need an approver. Every toggle is audited."
      />

      {pendingRequests.length > 0 && (
        <section className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h2 className="mb-3 font-medium text-amber-900">Prod toggles awaiting approval ({pendingRequests.length})</h2>
          <ul className="space-y-3">
            {pendingRequests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded border border-amber-200 bg-white p-3 text-sm">
                <div>
                  <p>
                    <Link href={`/apps/flags/${r.flagId}`} className="font-mono font-medium hover:underline">
                      {r.flag.key}
                    </Link>{" "}
                    <EnvironmentBadge environment={r.flag.environment} /> → turn <strong>{r.enabled ? "on" : "off"}</strong>
                  </p>
                  <p className="mt-1 text-slate-600">
                    {r.requestedByEmail}: “{r.reason}”
                  </p>
                </div>
                {canApprove &&
                  (r.requestedById === user.id ? (
                    <span className="text-xs text-slate-500">Your request: another approver must decide.</span>
                  ) : (
                    <div className="flex gap-2">
                      <FlagActionForm action={approveProdToggle} fields={{ requestId: r.id }} label="Approve" variant="primary" />
                      <FlagActionForm action={rejectProdToggle} fields={{ requestId: r.id }} label="Reject" variant="danger" />
                    </div>
                  ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="mb-4 flex gap-2 text-sm" aria-label="Environment">
        <Link href="/apps/flags" className={tabClass(!environment)}>
          All
        </Link>
        {FLAG_ENVIRONMENTS.map((e) => (
          <Link key={e} href={`/apps/flags?env=${e}`} className={tabClass(environment === e)}>
            {e}
          </Link>
        ))}
      </nav>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Key</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2">Environment</th>
              <th className="px-4 py-2">State</th>
              {canToggle && <th className="px-4 py-2">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {flags.map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-2">
                  <Link href={`/apps/flags/${f.id}`} className="font-mono font-medium text-slate-900 underline-offset-2 hover:underline">
                    {f.key}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-600">{f.description}</td>
                <td className="px-4 py-2">
                  <EnvironmentBadge environment={f.environment} />
                </td>
                <td className="px-4 py-2">
                  <FlagState enabled={f.enabled} />
                  {f.pendingRequest && <span className="ml-2 text-xs text-amber-700">pending → {f.pendingRequest.enabled ? "on" : "off"}</span>}
                </td>
                {canToggle && (
                  <td className="px-4 py-2">
                    {!requiresApproval(f.environment) ? (
                      <FlagActionForm
                        action={toggleFlag}
                        fields={{ id: f.id, enabled: String(!f.enabled) }}
                        label={f.enabled ? "Turn off" : "Turn on"}
                      />
                    ) : f.pendingRequest ? (
                      <span className="text-xs text-slate-500">Awaiting approval</span>
                    ) : (
                      <Link href={`/apps/flags/${f.id}`} className="text-sm text-slate-700 underline">
                        Request {f.enabled ? "turn off" : "turn on"}
                      </Link>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
