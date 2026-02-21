import { createHash, randomBytes } from "node:crypto";

function toBase64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function createRandomState(bytes = 32): string {
  return toBase64Url(randomBytes(bytes));
}

export function createPkceVerifier(bytes = 48): string {
  return toBase64Url(randomBytes(bytes));
}

export function createPkceChallenge(verifier: string): string {
  const digest = createHash("sha256").update(verifier).digest();
  return toBase64Url(digest);
}
