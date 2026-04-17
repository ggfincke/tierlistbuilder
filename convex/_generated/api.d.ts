/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as getHealth from "../getHealth.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_ids from "../lib/ids.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_userUpsert from "../lib/userUpsert.js";
import type * as lib_validators from "../lib/validators.js";
import type * as platform_media_internal from "../platform/media/internal.js";
import type * as platform_media_queries from "../platform/media/queries.js";
import type * as platform_media_uploads from "../platform/media/uploads.js";
import type * as platform_shortLinks_mutations from "../platform/shortLinks/mutations.js";
import type * as platform_shortLinks_queries from "../platform/shortLinks/queries.js";
import type * as users from "../users.js";
import type * as workspace_boards_internal from "../workspace/boards/internal.js";
import type * as workspace_boards_mutations from "../workspace/boards/mutations.js";
import type * as workspace_boards_queries from "../workspace/boards/queries.js";
import type * as workspace_boards_upsertBoardState from "../workspace/boards/upsertBoardState.js";
import type * as workspace_settings_mutations from "../workspace/settings/mutations.js";
import type * as workspace_settings_queries from "../workspace/settings/queries.js";
import type * as workspace_sync_boardReconciler from "../workspace/sync/boardReconciler.js";
import type * as workspace_sync_boardStateLoader from "../workspace/sync/boardStateLoader.js";
import type * as workspace_sync_boardSyncLimits from "../workspace/sync/boardSyncLimits.js";
import type * as workspace_sync_loadBoundedBoardRows from "../workspace/sync/loadBoundedBoardRows.js";
import type * as workspace_tierPresets_mutations from "../workspace/tierPresets/mutations.js";
import type * as workspace_tierPresets_queries from "../workspace/tierPresets/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  getHealth: typeof getHealth;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/ids": typeof lib_ids;
  "lib/permissions": typeof lib_permissions;
  "lib/userUpsert": typeof lib_userUpsert;
  "lib/validators": typeof lib_validators;
  "platform/media/internal": typeof platform_media_internal;
  "platform/media/queries": typeof platform_media_queries;
  "platform/media/uploads": typeof platform_media_uploads;
  "platform/shortLinks/mutations": typeof platform_shortLinks_mutations;
  "platform/shortLinks/queries": typeof platform_shortLinks_queries;
  users: typeof users;
  "workspace/boards/internal": typeof workspace_boards_internal;
  "workspace/boards/mutations": typeof workspace_boards_mutations;
  "workspace/boards/queries": typeof workspace_boards_queries;
  "workspace/boards/upsertBoardState": typeof workspace_boards_upsertBoardState;
  "workspace/settings/mutations": typeof workspace_settings_mutations;
  "workspace/settings/queries": typeof workspace_settings_queries;
  "workspace/sync/boardReconciler": typeof workspace_sync_boardReconciler;
  "workspace/sync/boardStateLoader": typeof workspace_sync_boardStateLoader;
  "workspace/sync/boardSyncLimits": typeof workspace_sync_boardSyncLimits;
  "workspace/sync/loadBoundedBoardRows": typeof workspace_sync_loadBoundedBoardRows;
  "workspace/tierPresets/mutations": typeof workspace_tierPresets_mutations;
  "workspace/tierPresets/queries": typeof workspace_tierPresets_queries;
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
