// Client for the Shipeedo tenant API. In development, point TENANT_API_URL at
// the tenant service; in production the variable is unset and requests go to
// the app's own origin, where the load balancer routes /api to the service.

export type TenantUser = {
  id?: number;
  userGuid?: string;
  name: string | null;
  surname: string | null;
  userName: string | null;
  emailAddress: string | null;
  isActive: boolean;
  roles: string[];
};

export class TenantApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "TenantApiError";
    this.status = status;
  }
}

type AbpEnvelope<T> = {
  result?: T;
  success?: boolean;
  error?: { message?: string } | null;
};

type GetUsersResult = {
  items?: Array<Record<string, unknown>>;
  totalCount?: number;
};

function resolveBaseUrl(requestOrigin: string) {
  const configured = process.env.TENANT_API_URL?.trim();
  return (configured || requestOrigin).replace(/\/$/, "");
}

export async function fetchTenantUsers(params: {
  accessToken: string;
  requestOrigin: string;
  filter?: string;
  maxResultCount?: number;
  skipCount?: number;
}): Promise<{ items: TenantUser[]; totalCount: number }> {
  const url = new URL(`${resolveBaseUrl(params.requestOrigin)}/api/core/user/getusers`);
  if (params.filter?.trim()) url.searchParams.set("filter", params.filter.trim());
  url.searchParams.set("maxResultCount", String(params.maxResultCount ?? 50));
  url.searchParams.set("skipCount", String(params.skipCount ?? 0));

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${params.accessToken}`,
      },
      cache: "no-store",
    });
  } catch {
    throw new TenantApiError(`Could not reach the tenant API at ${url.origin}`, 502);
  }

  if (!response.ok) {
    throw new TenantApiError(
      `Tenant API responded with ${response.status} when listing users`,
      response.status === 401 || response.status === 403 ? response.status : 502,
    );
  }

  const payload = (await response.json()) as AbpEnvelope<GetUsersResult>;
  if (payload.error?.message) {
    throw new TenantApiError(payload.error.message, 502);
  }

  const items = payload.result?.items ?? [];
  return {
    // Strip the DTO down to display fields — the tenant API includes
    // sensitive columns (password hash, apiKey) that must not pass through.
    items: items.map((item) => ({
      id: typeof item.id === "number" ? item.id : undefined,
      userGuid: typeof item.userGuid === "string" ? item.userGuid : undefined,
      name: typeof item.name === "string" ? item.name : null,
      surname: typeof item.surname === "string" ? item.surname : null,
      userName: typeof item.userName === "string" ? item.userName : null,
      emailAddress: typeof item.emailAddress === "string" ? item.emailAddress : null,
      isActive: item.isActive === true,
      roles: Array.isArray(item.roles)
        ? item.roles
            .map((role) =>
              typeof role === "object" && role !== null
                ? String(
                    (role as { displayName?: string; roleName?: string }).displayName ??
                      (role as { roleName?: string }).roleName ??
                      "",
                  )
                : String(role),
            )
            .filter(Boolean)
        : [],
    })),
    totalCount: payload.result?.totalCount ?? items.length,
  };
}
