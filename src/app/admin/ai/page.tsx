import { redirect } from "next/navigation";

// Folded into the combined admin settings page.
export default function AiSettingsPage() {
  redirect("/admin/settings#ai-provider");
}
