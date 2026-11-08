import { StatusBadge } from "./StatusBadge";

interface TrailEvent {
  id: string;
  createdAt: Date;
  actorEmail: string;
  actorRole: string;
  action: string;
  outcome: string;
  before: string | null;
  after: string | null;
  metadata: string | null;
}

const parse = (value: string | null): Record<string, unknown> | null => (value ? JSON.parse(value) : null);

function Json({ label, value }: { label: string; value: Record<string, unknown> | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <pre className="mt-1 overflow-x-auto rounded bg-slate-100 p-2 text-xs">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

/** A refund's state changes from the audit log (values already masked at write time). */
export function AuditTrail({ events }: { events: TrailEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-slate-600">No recorded changes (seeded record).</p>;
  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const before = parse(e.before);
        const after = parse(e.after);
        const metadata = parse(e.metadata);
        const from = typeof before?.status === "string" ? before.status : null;
        const to = typeof after?.status === "string" ? after.status : null;
        return (
          <li key={e.id} className="rounded border border-slate-200 p-3 text-sm" data-testid="audit-event">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-slate-500">{e.createdAt.toISOString().replace("T", " ").slice(0, 19)} UTC</span>
              <span className="font-mono text-xs">{e.action}</span>
              <span className={e.outcome === "denied" ? "text-red-600" : "text-green-700"}>{e.outcome}</span>
              <span className="text-slate-700">
                by {e.actorEmail} <span className="text-xs text-slate-500">({e.actorRole})</span>
              </span>
              {(from || to) && (
                <span className="flex items-center gap-1">
                  {from && <StatusBadge status={from} />}
                  {from && to && <span aria-hidden>→</span>}
                  {to && <StatusBadge status={to} />}
                </span>
              )}
            </div>
            {(before || after || metadata) && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-slate-600">Before / after</summary>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <Json label="Before" value={before} />
                  <Json label="After" value={after} />
                  <Json label="Details" value={metadata} />
                </div>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}
