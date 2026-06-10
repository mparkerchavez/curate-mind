import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";

export type PublicAuthContext = {
  tokenHash: string;
  tokenPrefix: string;
  requestId: string;
};

const storage = new AsyncLocalStorage<PublicAuthContext>();

export function hashBearerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getTokenPrefix(token: string): string {
  return token.slice(0, 10);
}

export function getBearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function buildPublicAuthContext(token: string): PublicAuthContext {
  return {
    tokenHash: hashBearerToken(token),
    tokenPrefix: getTokenPrefix(token),
    requestId: randomUUID(),
  };
}

export async function runWithPublicAuthContext<T>(
  context: PublicAuthContext,
  fn: () => Promise<T>
): Promise<T> {
  return await storage.run(context, fn);
}

export function getPublicAuthContext(): PublicAuthContext | null {
  return storage.getStore() ?? null;
}

