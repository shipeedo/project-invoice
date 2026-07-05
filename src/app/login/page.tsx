import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const useMockAuth =
  process.env.AUTH_MOCK === "true" ||
  (!process.env.CLIENT_SECRET && process.env.NODE_ENV === "development");

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/queue";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Project Invoice
          </p>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>
            Authenticate with Shipeedo to access your organisation&apos;s invoice queue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {params.error ? (
            <Alert variant="destructive">
              <AlertDescription>
                {params.error === "AccessDenied"
                  ? "Your account doesn't have access to Project Invoice. Ask an administrator to add you in the Users section."
                  : "Sign-in failed. Please try again."}
              </AlertDescription>
            </Alert>
          ) : null}

          {useMockAuth ? (
            <form action="/api/auth/mock-login" method="POST" className="space-y-4">
              <input type="hidden" name="callbackUrl" value={callbackUrl} />

              <Alert>
                <AlertDescription>
                  Development mock auth is enabled because `AUTH_MOCK=true` or `CLIENT_SECRET` is
                  unset.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  defaultValue="admin@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" type="text" defaultValue="Pilot Admin" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <select
                  id="role"
                  name="role"
                  defaultValue="ADMIN"
                  className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="APPROVER">Approver</option>
                  <option value="USER">User</option>
                </select>
              </div>

              <Button type="submit" className="w-full">
                Continue with mock login
              </Button>
            </form>
          ) : (
            <form action="/api/auth/shipeedo-login" method="POST">
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
              <Button type="submit" className="w-full">
                Sign in with Shipeedo
              </Button>
            </form>
          )}

          <p className="text-xs text-muted-foreground">
            OAuth callback: <code>/api/auth/callback/shipeedo</code>
          </p>
          <p className="text-xs text-muted-foreground">
            See <code>docs/environment-setup.md</code> for local secret configuration.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
