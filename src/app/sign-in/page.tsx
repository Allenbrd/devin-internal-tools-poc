import { redirect } from "next/navigation";
import { getAuthProvider, getCurrentUser } from "@/platform/auth";
import { signInAsMockUser } from "@/platform/auth/mock/actions";
import { mockAuthProvider } from "@/platform/auth/mock/provider";

const ERRORS: Record<string, string> = {
  invalid: "Invalid sign-in request.",
  unknown_user: "That user does not exist or is disabled.",
};

// Public page. Provider-specific: a real SSO provider would redirect to the IdP here.
export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (getAuthProvider().id !== "mock") redirect(getAuthProvider().signInPath);
  if (await getCurrentUser()) redirect("/");

  const { next, error } = await searchParams;
  const users = await mockAuthProvider.listSignInOptions();

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-slate-600">
        Mock SSO for local development. Pick a seeded user; this is replaced by Microsoft Entra ID later.
      </p>
      {typeof error === "string" && ERRORS[error] && (
        <p role="alert" className="mt-4 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {ERRORS[error]}
        </p>
      )}
      <ul className="mt-6 space-y-2">
        {users.map((u) => (
          <li key={u.id}>
            <form action={signInAsMockUser}>
              <input type="hidden" name="userId" value={u.id} />
              {typeof next === "string" && <input type="hidden" name="next" value={next} />}
              <button
                type="submit"
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-slate-400"
              >
                <span>
                  <span className="block font-medium">{u.name}</span>
                  <span className="block text-sm text-slate-600">{u.email}</span>
                </span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-700">{u.role}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
      {users.length === 0 && <p className="mt-6 text-sm text-slate-600">No users found. Run <code>npm run db:setup</code>.</p>}
    </main>
  );
}
