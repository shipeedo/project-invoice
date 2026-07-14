import { redirect } from "next/navigation";

// Folded into the combined admin settings page.
export default function UsersPage() {
  redirect("/admin/settings#users");
}
