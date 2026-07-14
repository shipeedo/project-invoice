import Image from "next/image";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const useMockAuth =
  process.env.AUTH_MOCK === "true" ||
  (!process.env.CLIENT_SECRET && process.env.NODE_ENV === "development");

const highlights = [
  "Supplier invoices captured straight from your inbox",
  "Details and line items read and coded automatically",
  "One queue for review, approvals, and credits",
];

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
        <CardHeader className="items-center gap-3 text-center">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={56}
            height={56}
            priority
            className="mx-auto rounded-xl"
          />
          <CardTitle className="text-2xl">Project Invoice</CardTitle>
          <CardDescription>
            Every supplier invoice, from inbox to approved — in one place.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ul className="space-y-2 text-sm text-muted-foreground">
            {highlights.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                {item}
              </li>
            ))}
          </ul>

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
                <AlertDescription>Development mock auth is enabled.</AlertDescription>
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
                Sign in
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
