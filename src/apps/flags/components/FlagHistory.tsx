interface HistoryEvent {
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

const parse = (value: string | null): Record<string, unknown> => (value ? JSON.parse(value) : {});
const onOff = (v: unknown) => (v === true ? "on" : v === false ? "off" : "?");

function describe(e: HistoryEvent): string {
  const before = parse(e.before);
  const after = parse(e.after);
  const meta = parse(e.metadata);
  if (e.outcome === "denied") {
    const why = meta.reason === "approval_required" ? "needs approval" : meta.reason === "self_approval" ? "own request" : String(meta.reason ?? "");
    return `refused (${why})`;
  }
  switch (e.action) {
    case "flag.toggle":
      return `turned ${onOff(after.enabled)} (was ${onOff(before.enabled)})`;
    case "flag.toggle_request":
      return `requested turn ${onOff(after.requestedEnabled)}: “${String(meta.reason ?? "")}”`;
    case "flag.toggle_approve":
      return `approved ${String(meta.requestedBy ?? "")}'s request: turned ${onOff(after.enabled)} (was ${onOff(before.enabled)})`;
    case "flag.toggle_reject":
      return `rejected ${String(meta.requestedBy ?? "")}'s request to turn ${onOff(meta.requestedEnabled)}`;
    default:
      return e.action;
  }
}

/** A flag's history from the audit log. */
export function FlagHistory({ events }: { events: HistoryEvent[] }) {
  if (events.length === 0) return <p className="px-4 py-3 text-sm text-slate-500">No recorded changes (seeded state).</p>;
  return (
    <ol className="divide-y divide-slate-100">
      {events.map((e) => (
        <li key={e.id} className="flex flex-wrap items-baseline gap-2 px-4 py-2 text-sm" data-testid="flag-history-event">
          <span className="font-mono text-xs text-slate-500">{e.createdAt.toISOString().replace("T", " ").slice(0, 19)} UTC</span>
          <span>
            {e.actorEmail} <span className="text-xs text-slate-500">({e.actorRole})</span>
          </span>
          <span className={e.outcome === "denied" ? "text-red-600" : "text-slate-800"}>{describe(e)}</span>
          <span className="font-mono text-xs text-slate-400">{e.action}</span>
        </li>
      ))}
    </ol>
  );
}
