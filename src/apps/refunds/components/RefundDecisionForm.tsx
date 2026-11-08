"use client";

import { useActionState } from "react";
import { decideRefund, type RefundActionState } from "../actions";

export function RefundDecisionForm({ refundId }: { refundId: string }) {
  const [state, formAction, pending] = useActionState<RefundActionState, FormData>(decideRefund, { ok: false });

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={refundId} />
      <label className="block text-sm font-medium text-slate-700">
        Note <span className="font-normal text-slate-500">(optional)</span>
        <textarea name="note" rows={2} maxLength={500} className="mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={pending}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="submit"
          name="decision"
          value="reject"
          disabled={pending}
          className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Reject
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
