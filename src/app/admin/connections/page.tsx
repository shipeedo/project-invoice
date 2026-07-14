import { redirect } from "next/navigation";

// Folded into the combined admin settings page.
export default function ConnectionsPage() {
  redirect("/admin/settings");
}
