"use client";

import { useActionState } from "react";
import { requestRefund, type RefundActionState } from "../actions";

interface Props {
  customers: { id: string; name: string }[];
  currencies: readonly string[];
  thresholdLabel: string;
}

const inputClass = "mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm";

function FieldError({ errors }: { errors?: string[] }) {
  return errors ? <span className="text-xs text-red-600">{errors[0]}</span> : null;
}

export function RefundRequestForm({ customers, currencies, thresholdLabel }: Props) {
  const [state, formAction, pending] = useActionState<RefundActionState, FormData>(requestRefund, { ok: false });

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <label className="block text-sm font-medium text-slate-700">
        Customer
        <select name="customerId" defaultValue="" className={inputClass} required>
          <option value="" disabled>
            Choose a customer…
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <FieldError errors={state.errors?.customerId} />
      </label>
      <div className="flex gap-3">
        <label className="block flex-1 text-sm font-medium text-slate-700">
          Amount
          <input name="amount" inputMode="decimal" placeholder="e.g. 125.00" className={inputClass} required />
          <FieldError errors={state.errors?.amount} />
        </label>
        <label className="block w-28 text-sm font-medium text-slate-700">
          Currency
          <select name="currency" defaultValue={currencies[0]} className={inputClass}>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-slate-500">Refunds of {thresholdLabel} or more need two approvals from two different approvers.</p>
      <label className="block text-sm font-medium text-slate-700">
        Reason
        <textarea name="reason" rows={3} className={inputClass} required />
        <FieldError errors={state.errors?.reason} />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Destination IBAN
        <input name="destinationIban" autoComplete="off" placeholder="e.g. GB82 WEST 1234 5698 7654 32" className={inputClass} required />
        <FieldError errors={state.errors?.destinationIban} />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Submitting…" : "Request refund"}
        </button>
        {state.message && (
          <span role="status" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
