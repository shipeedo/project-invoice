import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  const secret = process.env.AUTH_SECRET ?? process.env.MS_TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("AUTH_SECRET is required to encrypt O365 tokens");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string) {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(payload: string) {
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Invalid encrypted payload");
  }

  const key = getEncryptionKey();
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
