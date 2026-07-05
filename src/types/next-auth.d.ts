import type { UserRole } from "@/lib/db/types";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: UserRole;
      organizationId: string;
    };
    /** OIDC access token for calling the Shipeedo tenant API. */
    accessToken?: string;
  }

  interface User {
    role?: UserRole;
    organizationId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: UserRole;
    organizationId?: string;
    accessToken?: string;
  }
}
