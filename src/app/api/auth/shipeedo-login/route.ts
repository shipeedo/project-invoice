import { signIn } from "@/lib/auth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const callbackUrl = String(formData.get("callbackUrl") || "/queue");

  await signIn("shipeedo", {
    redirectTo: callbackUrl,
  });
}
