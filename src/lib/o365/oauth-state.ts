import { createHmac, randomBytes, timingSafeEqual } from "crypto";

type O365OAuthState = {
  organizationId: string;
  userId: string;
  nonce: string;
  issuedAt: number;
};

function getStateSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required for O365 OAuth state");
  }
  return secret;
}

function signPayload(payload: string) {
  return createHmac("sha256", getStateSecret()).update(payload).digest("base64url");
}

export function createO365OAuthState(input: {
  organizationId: string;
  userId: string;
}) {
  const state: O365OAuthState = {
    organizationId: input.organizationId,
    userId: input.userId,
    nonce: randomBytes(16).toString("base64url"),
    issuedAt: Date.now(),
  };

  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function parseO365OAuthState(value: string) {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) {
    return { error: "Invalid OAuth state" as const };
  }

  const expected = signPayload(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return { error: "Invalid OAuth state signature" as const };
  }

  const parsed = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as O365OAuthState;

  const maxAgeMs = 15 * 60 * 1000;
  if (Date.now() - parsed.issuedAt > maxAgeMs) {
    return { error: "OAuth state expired" as const };
  }

  return { state: parsed };
}
