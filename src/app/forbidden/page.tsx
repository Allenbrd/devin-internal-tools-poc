import Link from "next/link";

// Public page: shown after requirePermission() denies access.
export default function ForbiddenPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-red-600">403</p>
      <h1 className="mt-2 text-2xl font-semibold">Access denied</h1>
      <p className="mt-2 text-sm text-slate-600">Your role does not have permission for that page. This attempt was logged.</p>
      <Link href="/" className="mt-6 inline-block text-sm underline">
        Back to home
      </Link>
    </main>
  );
}
