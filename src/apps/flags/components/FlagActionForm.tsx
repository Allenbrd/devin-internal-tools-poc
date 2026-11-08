"use client";

import { useActionState } from "react";
import type { FlagActionState } from "../actions";

interface Props {
  action: (prev: FlagActionState, formData: FormData) => Promise<FlagActionState>;
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  /** Show a required "reason" text input (prod requests). */
  withReason?: boolean;
}

const VARIANTS = {
  primary: "bg-slate-900 text-white hover:bg-slate-700",
  secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100",
  danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
};

export function FlagActionForm({ action, fields, label, pendingLabel = "Saving…", variant = "secondary", withReason }: Props) {
  const [state, formAction, pending] = useActionState<FlagActionState, FormData>(action, { ok: false });

  return (
    <form action={formAction} className="space-y-2">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {withReason && (
        <label className="block text-sm font-medium text-slate-700">
          Reason
          <input
            name="reason"
            required
            minLength={3}
            maxLength={500}
            placeholder="Why does prod need this change?"
            className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
          {state.errors?.reason && <span className="text-xs text-red-600">{state.errors.reason[0]}</span>}
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className={`rounded px-3 py-1 text-sm font-medium disabled:opacity-50 ${VARIANTS[variant]}`}
        >
          {pending ? pendingLabel : label}
        </button>
        {state.message && (
          <span role="status" className={`text-xs ${state.ok ? "text-green-700" : "text-red-600"}`}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
