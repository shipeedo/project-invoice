import { AppShell } from "@/components/app-shell";
import { UploadForm } from "@/components/upload-form";
import { requireSession } from "@/lib/session";

export default async function UploadPage() {
  const session = await requireSession();

  return (
    <AppShell user={session.user} activePath="/upload">
      <div className="max-w-2xl">
        <UploadForm />
      </div>
    </AppShell>
  );
}
