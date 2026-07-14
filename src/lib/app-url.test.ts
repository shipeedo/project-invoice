import { afterEach, describe, expect, it } from "vitest";
import { getAppOrigin } from "./app-url";

const ORIGINAL_AUTH_URL = process.env.AUTH_URL;
const ORIGINAL_NEXTAUTH_URL = process.env.NEXTAUTH_URL;

afterEach(() => {
  if (ORIGINAL_AUTH_URL === undefined) delete process.env.AUTH_URL;
  else process.env.AUTH_URL = ORIGINAL_AUTH_URL;
  if (ORIGINAL_NEXTAUTH_URL === undefined) delete process.env.NEXTAUTH_URL;
  else process.env.NEXTAUTH_URL = ORIGINAL_NEXTAUTH_URL;
});

describe("getAppOrigin", () => {
  it("returns the request origin when no canonical URL is configured", () => {
    delete process.env.AUTH_URL;
    delete process.env.NEXTAUTH_URL;
    expect(getAppOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("prefers AUTH_URL over the request origin", () => {
    process.env.AUTH_URL = "https://pi.shipeedo.com";
    expect(getAppOrigin("http://0.0.0.0:3000")).toBe("https://pi.shipeedo.com");
  });

  it("normalises AUTH_URL with a path or trailing slash to its origin", () => {
    process.env.AUTH_URL = "https://pi.shipeedo.com/api/auth/";
    expect(getAppOrigin("http://0.0.0.0:3000")).toBe("https://pi.shipeedo.com");
  });

  it("falls back to NEXTAUTH_URL when AUTH_URL is unset", () => {
    delete process.env.AUTH_URL;
    process.env.NEXTAUTH_URL = "https://pi.shipeedo.com";
    expect(getAppOrigin("http://0.0.0.0:3000")).toBe("https://pi.shipeedo.com");
  });

  it("returns the request origin when the configured URL is invalid", () => {
    process.env.AUTH_URL = "not-a-url";
    expect(getAppOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });
});
