"use client";

import { useEffect, useState, useTransition } from "react";
import { revealSensitiveField } from "./actions";
import type { MaskedField } from "./define";

const REMASK_AFTER_MS = 30_000;

const ERRORS: Record<string, string> = {
  forbidden: "You don't have permission to reveal this.",
  unauthenticated: "Your session has expired.",
  not_found: "Value not found.",
  invalid: "Invalid request.",
};

/** Shows a masked value; optionally lets permitted users reveal it for 30s. */
export function SensitiveValue({ field, canReveal }: { field: MaskedField; canReveal: boolean }) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (value === null) return;
    const timer = setTimeout(() => setValue(null), REMASK_AFTER_MS);
    return () => clearTimeout(timer);
  }, [value]);

  const reveal = () =>
    startTransition(async () => {
      setError(null);
      const result = await revealSensitiveField({
        resource: field.resource,
        recordId: field.recordId,
        field: field.field,
      });
      if (result.ok) setValue(result.value);
      else setError(ERRORS[result.error] ?? "Could not reveal value.");
    });

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono" data-testid={`sensitive-${field.field}`}>
        {value ?? field.display}
      </span>
      {canReveal && (
        <button
          type="button"
          onClick={value === null ? reveal : () => setValue(null)}
          disabled={pending}
          className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          aria-label={value === null ? `Reveal ${field.label}` : `Hide ${field.label}`}
        >
          {pending ? "…" : value === null ? "Reveal" : "Hide"}
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
