"use client";

import { useActionState } from "react";
import { markRefundPaid, type RefundActionState } from "../actions";

export function MarkPaidForm({ refundId }: { refundId: string }) {
  const [state, formAction, pending] = useActionState<RefundActionState, FormData>(markRefundPaid, { ok: false });

  return (
    <form action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="id" value={refundId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Mark as paid"}
      </button>
      {state.message && (
        <span role="status" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}
