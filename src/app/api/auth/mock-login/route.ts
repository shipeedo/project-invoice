import { signIn } from "@/lib/auth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const callbackUrl = String(formData.get("callbackUrl") || "/queue");

  await signIn("mock", {
    email: String(formData.get("email")),
    name: String(formData.get("name")),
    role: String(formData.get("role")),
    redirectTo: callbackUrl,
  });
}
