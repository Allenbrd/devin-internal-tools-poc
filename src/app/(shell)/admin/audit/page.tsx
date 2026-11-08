import Link from "next/link";
import { listAuditEvents, recordAudit, type AuditFilters } from "@/platform/audit";
import { requirePermission } from "@/platform/permissions";
import { PageHeader } from "@/platform/shell";

const FILTER_KEYS = ["actorEmail", "action", "resourceType", "resourceId", "outcome"] as const;

function JsonCell({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-slate-600">{label}</summary>
      <pre className="mt-1 max-w-md overflow-x-auto rounded bg-slate-100 p-2">{JSON.stringify(JSON.parse(value), null, 2)}</pre>
    </details>
  );
}

export default async function AuditLogPage({ searchParams }: PageProps<"/admin/audit">) {
  const user = await requirePermission("audit:read");
  const params = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined);

  const filters: AuditFilters = Object.fromEntries(FILTER_KEYS.map((k) => [k, str(params[k])]).filter(([, v]) => v));
  const page = Math.max(1, Number.parseInt(str(params.page) ?? "1", 10) || 1);

  const { events, total, pageCount } = await listAuditEvents(filters, page);
  await recordAudit({ actor: user, action: "audit.read", metadata: { filters, page } });

  const pageHref = (p: number) => `?${new URLSearchParams({ ...(filters as Record<string, string>), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Audit log" description={`Append-only. ${total} matching event${total === 1 ? "" : "s"}. Sensitive values are stored masked.`} />
      <form className="mb-4 flex flex-wrap items-end gap-3 text-sm" method="get">
        {FILTER_KEYS.map((key) => (
          <label key={key} className="flex flex-col text-slate-600">
            {key}
            <input name={key} defaultValue={filters[key] ?? ""} className="mt-1 rounded border border-slate-300 px-2 py-1 text-slate-900" />
          </label>
        ))}
        <button type="submit" className="rounded bg-slate-900 px-3 py-1.5 font-medium text-white">
          Filter
        </button>
        <Link href="/admin/audit" className="py-1.5 text-slate-600 underline">
          Clear
        </Link>
      </form>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">When (UTC)</th>
              <th className="px-3 py-2">Who</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Outcome</th>
              <th className="px-3 py-2">Resource</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {events.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{e.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                <td className="px-3 py-2">
                  {e.actorEmail}
                  <span className="ml-1 text-xs text-slate-500">({e.actorRole})</span>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{e.action}</td>
                <td className={`px-3 py-2 ${e.outcome === "denied" ? "text-red-600" : "text-green-700"}`}>{e.outcome}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {e.resourceType ?? "—"}
                  {e.resourceId && <span className="block text-slate-500">{e.resourceId}</span>}
                </td>
                <td className="space-y-1 px-3 py-2">
                  <JsonCell label="before" value={e.before} />
                  <JsonCell label="after" value={e.after} />
                  <JsonCell label="metadata" value={e.metadata} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="mt-4 flex items-center gap-4 text-sm" aria-label="Pagination">
        {page > 1 && <Link href={pageHref(page - 1)} className="underline">Previous</Link>}
        <span className="text-slate-600">Page {page} of {pageCount}</span>
        {page < pageCount && <Link href={pageHref(page + 1)} className="underline">Next</Link>}
      </nav>
    </>
  );
}
