// Replit-friendly version: don't depend on the convex/_generated folder.
// anyApi is the same thing the generated api.js exports under the hood.
import { anyApi } from "convex/server";
import type { GenericId } from "convex/values";

export const api: any = anyApi;
export type Id<T extends string> = GenericId<T>;
export type Doc<T extends string> = any;