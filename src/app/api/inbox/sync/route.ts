import { auth } from "@/lib/auth";
import { pollOrganizationMailbox } from "@/lib/o365/poll";
import { encodeSyncProgressEvent } from "@/lib/o365/sync-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Parameters<typeof encodeSyncProgressEvent>[0]) => {
        controller.enqueue(encoder.encode(encodeSyncProgressEvent(event)));
      };

      try {
        const result = await pollOrganizationMailbox(session.user.organizationId, {
          onProgress: send,
        });

        send({ type: "complete", result });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Sync failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
