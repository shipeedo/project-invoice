import { signIn } from "@/lib/auth";

const useMockAuth =
  process.env.AUTH_MOCK === "true" ||
  (!process.env.CLIENT_SECRET && process.env.NODE_ENV === "development");

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Project Invoice
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Sign in</h1>
          <p className="mt-2 text-sm text-slate-600">
            Authenticate with Shipeedo to access your organisation&apos;s invoice queue.
          </p>
        </div>

        {params.error ? (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Sign-in failed. Please try again.
          </p>
        ) : null}

        {useMockAuth ? (
          <form
            action={async (formData) => {
              "use server";
              await signIn("mock", {
                email: String(formData.get("email")),
                name: String(formData.get("name")),
                role: String(formData.get("role")),
                redirectTo: params.callbackUrl ?? "/",
              });
            }}
            className="space-y-3"
          >
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Development mock auth is enabled because `AUTH_MOCK=true` or `CLIENT_SECRET` is unset.
            </p>
            <input
              name="email"
              type="email"
              required
              defaultValue="admin@example.com"
              placeholder="Email"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="name"
              type="text"
              defaultValue="Pilot Admin"
              placeholder="Name"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <select name="role" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="ADMIN">Admin</option>
              <option value="APPROVER">Approver</option>
              <option value="USER">User</option>
            </select>
            <button
              type="submit"
              className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Continue with mock login
            </button>
          </form>
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("shipeedo", { redirectTo: params.callbackUrl ?? "/" });
            }}
          >
            <button
              type="submit"
              className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Sign in with Shipeedo
            </button>
          </form>
        )}

        <p className="text-xs text-slate-500">
          OAuth callback: <code>/api/auth/callback/shipeedo</code>
        </p>
        <p className="text-xs text-slate-500">
          See <code>docs/environment-setup.md</code> for local secret configuration.
        </p>
      </div>
    </div>
  );
}
