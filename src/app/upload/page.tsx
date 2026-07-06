import { AppShell } from "@/components/app-shell";
import { UploadForm } from "@/components/upload-form";
import { getNavCounts } from "@/lib/nav-counts";
import { requireSession } from "@/lib/session";

export default async function UploadPage() {
  const session = await requireSession();
  const navCounts = await getNavCounts(session.user.organizationId);

  return (
    <AppShell
      user={session.user}
      activePath="/upload"
      navCounts={navCounts}
      breadcrumbs={[{ label: "Upload" }]}
    >
      <div className="max-w-2xl">
        <UploadForm />
      </div>
    </AppShell>
  );
}
