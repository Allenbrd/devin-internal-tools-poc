"use client";

import { useActionState } from "react";
import { updateCustomer, type UpdateCustomerState } from "../actions";

interface Props {
  customer: { id: string; name: string; status: string };
  statuses: readonly string[];
}

const inputClass = "mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm";

export function CustomerEditForm({ customer, statuses }: Props) {
  const [state, formAction, pending] = useActionState<UpdateCustomerState, FormData>(updateCustomer, { ok: false });

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={customer.id} />
      <label className="block text-sm font-medium text-slate-700">
        Name
        <input name="name" defaultValue={customer.name} className={inputClass} />
        {state.errors?.name && <span className="text-xs text-red-600">{state.errors.name[0]}</span>}
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Status
        <select name="status" defaultValue={customer.status} className={inputClass}>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Replace IBAN <span className="font-normal text-slate-500">(leave empty to keep current)</span>
        <input name="iban" autoComplete="off" placeholder="e.g. GB82 WEST 1234 5698 7654 32" className={inputClass} />
        {state.errors?.iban && <span className="text-xs text-red-600">{state.errors.iban[0]}</span>}
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
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
