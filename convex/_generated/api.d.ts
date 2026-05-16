/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as backend from "../backend.js";
import type * as chat from "../chat.js";
import type * as corrections from "../corrections.js";
import type * as dataPoints from "../dataPoints.js";
import type * as mentalModels from "../mentalModels.js";
import type * as migrations from "../migrations.js";
import type * as observations from "../observations.js";
import type * as positions from "../positions.js";
import type * as projects from "../projects.js";
import type * as researchLens from "../researchLens.js";
import type * as search from "../search.js";
import type * as sources from "../sources.js";
import type * as tags from "../tags.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  backend: typeof backend;
  chat: typeof chat;
  corrections: typeof corrections;
  dataPoints: typeof dataPoints;
  mentalModels: typeof mentalModels;
  migrations: typeof migrations;
  observations: typeof observations;
  positions: typeof positions;
  projects: typeof projects;
  researchLens: typeof researchLens;
  search: typeof search;
  sources: typeof sources;
  tags: typeof tags;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
