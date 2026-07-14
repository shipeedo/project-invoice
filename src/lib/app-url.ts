// Behind the ingress, request.url's origin is the pod's listen address
// (e.g. http://0.0.0.0:3000), so anything user-facing built from a request
// origin must prefer the configured canonical URL.
export function getAppOrigin(requestOrigin: string): string {
  const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (!configured) return requestOrigin;
  try {
    return new URL(configured).origin;
  } catch {
    return requestOrigin;
  }
}
