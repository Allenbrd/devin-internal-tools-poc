export function FlagState({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
        enabled ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"
      }`}
    >
      {enabled ? "On" : "Off"}
    </span>
  );
}

const ENV_STYLES: Record<string, string> = {
  dev: "bg-sky-100 text-sky-800",
  staging: "bg-amber-100 text-amber-800",
  prod: "bg-red-100 text-red-800",
};

export function EnvironmentBadge({ environment }: { environment: string }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 font-mono text-xs ${ENV_STYLES[environment] ?? "bg-slate-100 text-slate-700"}`}>
      {environment}
    </span>
  );
}
