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
import type * as dev_autoCrop from "../dev/autoCrop.js";
import type * as dev_reset from "../dev/reset.js";
import type * as dev_resetLock from "../dev/resetLock.js";
import type * as dev_seedGate from "../dev/seedGate.js";
import type * as dev_tlotlSeed from "../dev/tlotlSeed.js";
import type * as http from "../http.js";
import type * as lib_assertions from "../lib/assertions.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_avatar from "../lib/avatar.js";
import type * as lib_cache from "../lib/cache.js";
import type * as lib_cascadeDelete from "../lib/cascadeDelete.js";
import type * as lib_entitlements from "../lib/entitlements.js";
import type * as lib_equality from "../lib/equality.js";
import type * as lib_hexColor from "../lib/hexColor.js";
import type * as lib_imageValidation from "../lib/imageValidation.js";
import type * as lib_jobs from "../lib/jobs.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_marketplaceLookups from "../lib/marketplaceLookups.js";
import type * as lib_mediaVariants from "../lib/mediaVariants.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_rateLimiter from "../lib/rateLimiter.js";
import type * as lib_retry from "../lib/retry.js";
import type * as lib_scheduler from "../lib/scheduler.js";
import type * as lib_seedContentHash from "../lib/seedContentHash.js";
import type * as lib_sha256 from "../lib/sha256.js";
import type * as lib_storage from "../lib/storage.js";
import type * as lib_templateProgress from "../lib/templateProgress.js";
import type * as lib_text from "../lib/text.js";
import type * as lib_uploadToken from "../lib/uploadToken.js";
import type * as lib_uploadedImage from "../lib/uploadedImage.js";
import type * as lib_userUpsert from "../lib/userUpsert.js";
import type * as lib_validators_common from "../lib/validators/common.js";
import type * as lib_validators_marketplace from "../lib/validators/marketplace.js";
import type * as lib_validators_platform from "../lib/validators/platform.js";
import type * as lib_validators_seedPipeline from "../lib/validators/seedPipeline.js";
import type * as lib_validators_tierSpec from "../lib/validators/tierSpec.js";
import type * as lib_validators_workspace from "../lib/validators/workspace.js";
import type * as marketplace_rankings_aggregate_jobs from "../marketplace/rankings/aggregate/jobs.js";
import type * as marketplace_rankings_aggregate_lib from "../marketplace/rankings/aggregate/lib.js";
import type * as marketplace_rankings_lib from "../marketplace/rankings/lib.js";
import type * as marketplace_rankings_maintenance_cascade from "../marketplace/rankings/maintenance/cascade.js";
import type * as marketplace_rankings_public_mutations from "../marketplace/rankings/public/mutations.js";
import type * as marketplace_rankings_public_queries from "../marketplace/rankings/public/queries.js";
import type * as marketplace_rankings_seed_actions from "../marketplace/rankings/seed/actions.js";
import type * as marketplace_rankings_seed_cleanup from "../marketplace/rankings/seed/cleanup.js";
import type * as marketplace_rankings_seed_curatedResolver from "../marketplace/rankings/seed/curatedResolver.js";
import type * as marketplace_rankings_seed_lifecycle from "../marketplace/rankings/seed/lifecycle.js";
import type * as marketplace_rankings_seed_naming from "../marketplace/rankings/seed/naming.js";
import type * as marketplace_rankings_seed_plan from "../marketplace/rankings/seed/plan.js";
import type * as marketplace_rankings_seed_rows from "../marketplace/rankings/seed/rows.js";
import type * as marketplace_rankings_seed_scoring from "../marketplace/rankings/seed/scoring.js";
import type * as marketplace_rankings_seed_validators from "../marketplace/rankings/seed/validators.js";
import type * as marketplace_seedAuth from "../marketplace/seedAuth.js";
import type * as marketplace_seedPipeline_activation from "../marketplace/seedPipeline/activation.js";
import type * as marketplace_seedPipeline_diagnostics from "../marketplace/seedPipeline/diagnostics.js";
import type * as marketplace_seedPipeline_media from "../marketplace/seedPipeline/media.js";
import type * as marketplace_seedPipeline_mediaLookup from "../marketplace/seedPipeline/mediaLookup.js";
import type * as marketplace_seedPipeline_resolvers from "../marketplace/seedPipeline/resolvers.js";
import type * as marketplace_seedPipeline_runs from "../marketplace/seedPipeline/runs.js";
import type * as marketplace_seedPipeline_storageUploads from "../marketplace/seedPipeline/storageUploads.js";
import type * as marketplace_seedPipeline_templates from "../marketplace/seedPipeline/templates.js";
import type * as marketplace_seedPipeline_types from "../marketplace/seedPipeline/types.js";
import type * as marketplace_seedPipeline_validators from "../marketplace/seedPipeline/validators.js";
import type * as marketplace_seedRuns from "../marketplace/seedRuns.js";
import type * as marketplace_templates_bookmarks from "../marketplace/templates/bookmarks.js";
import type * as marketplace_templates_criteria from "../marketplace/templates/criteria.js";
import type * as marketplace_templates_internal from "../marketplace/templates/internal.js";
import type * as marketplace_templates_lib_board from "../marketplace/templates/lib/board.js";
import type * as marketplace_templates_lib_normalize from "../marketplace/templates/lib/normalize.js";
import type * as marketplace_templates_lib_projections from "../marketplace/templates/lib/projections.js";
import type * as marketplace_templates_lib_state from "../marketplace/templates/lib/state.js";
import type * as marketplace_templates_lib_trending from "../marketplace/templates/lib/trending.js";
import type * as marketplace_templates_lib_writes from "../marketplace/templates/lib/writes.js";
import type * as marketplace_templates_mutations from "../marketplace/templates/mutations.js";
import type * as marketplace_templates_queries from "../marketplace/templates/queries.js";
import type * as marketplace_templates_seed from "../marketplace/templates/seed.js";
import type * as platform_media_internal from "../platform/media/internal.js";
import type * as platform_media_queries from "../platform/media/queries.js";
import type * as platform_media_uploads from "../platform/media/uploads.js";
import type * as platform_preferences_mutations from "../platform/preferences/mutations.js";
import type * as platform_preferences_queries from "../platform/preferences/queries.js";
import type * as platform_profile_queries from "../platform/profile/queries.js";
import type * as platform_shortLinks_internal from "../platform/shortLinks/internal.js";
import type * as platform_shortLinks_listing from "../platform/shortLinks/listing.js";
import type * as platform_shortLinks_mutations from "../platform/shortLinks/mutations.js";
import type * as platform_shortLinks_queries from "../platform/shortLinks/queries.js";
import type * as platform_showcase_internal from "../platform/showcase/internal.js";
import type * as platform_showcase_lib from "../platform/showcase/lib.js";
import type * as platform_showcase_mutations from "../platform/showcase/mutations.js";
import type * as platform_showcase_queries from "../platform/showcase/queries.js";
import type * as platform_showcase_validators from "../platform/showcase/validators.js";
import type * as users from "../users.js";
import type * as workspace_boards_cloudFields from "../workspace/boards/cloudFields.js";
import type * as workspace_boards_internal from "../workspace/boards/internal.js";
import type * as workspace_boards_librarySummary from "../workspace/boards/librarySummary.js";
import type * as workspace_boards_mutations from "../workspace/boards/mutations.js";
import type * as workspace_boards_queries from "../workspace/boards/queries.js";
import type * as workspace_boards_sourceFields from "../workspace/boards/sourceFields.js";
import type * as workspace_boards_upsertBoardState from "../workspace/boards/upsertBoardState.js";
import type * as workspace_sync_boardReconciler from "../workspace/sync/boardReconciler.js";
import type * as workspace_sync_boardStateLoader from "../workspace/sync/boardStateLoader.js";
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
  "dev/autoCrop": typeof dev_autoCrop;
  "dev/reset": typeof dev_reset;
  "dev/resetLock": typeof dev_resetLock;
  "dev/seedGate": typeof dev_seedGate;
  "dev/tlotlSeed": typeof dev_tlotlSeed;
  http: typeof http;
  "lib/assertions": typeof lib_assertions;
  "lib/auth": typeof lib_auth;
  "lib/avatar": typeof lib_avatar;
  "lib/cache": typeof lib_cache;
  "lib/cascadeDelete": typeof lib_cascadeDelete;
  "lib/entitlements": typeof lib_entitlements;
  "lib/equality": typeof lib_equality;
  "lib/hexColor": typeof lib_hexColor;
  "lib/imageValidation": typeof lib_imageValidation;
  "lib/jobs": typeof lib_jobs;
  "lib/limits": typeof lib_limits;
  "lib/marketplaceLookups": typeof lib_marketplaceLookups;
  "lib/mediaVariants": typeof lib_mediaVariants;
  "lib/pagination": typeof lib_pagination;
  "lib/permissions": typeof lib_permissions;
  "lib/rateLimiter": typeof lib_rateLimiter;
  "lib/retry": typeof lib_retry;
  "lib/scheduler": typeof lib_scheduler;
  "lib/seedContentHash": typeof lib_seedContentHash;
  "lib/sha256": typeof lib_sha256;
  "lib/storage": typeof lib_storage;
  "lib/templateProgress": typeof lib_templateProgress;
  "lib/text": typeof lib_text;
  "lib/uploadToken": typeof lib_uploadToken;
  "lib/uploadedImage": typeof lib_uploadedImage;
  "lib/userUpsert": typeof lib_userUpsert;
  "lib/validators/common": typeof lib_validators_common;
  "lib/validators/marketplace": typeof lib_validators_marketplace;
  "lib/validators/platform": typeof lib_validators_platform;
  "lib/validators/seedPipeline": typeof lib_validators_seedPipeline;
  "lib/validators/tierSpec": typeof lib_validators_tierSpec;
  "lib/validators/workspace": typeof lib_validators_workspace;
  "marketplace/rankings/aggregate/jobs": typeof marketplace_rankings_aggregate_jobs;
  "marketplace/rankings/aggregate/lib": typeof marketplace_rankings_aggregate_lib;
  "marketplace/rankings/lib": typeof marketplace_rankings_lib;
  "marketplace/rankings/maintenance/cascade": typeof marketplace_rankings_maintenance_cascade;
  "marketplace/rankings/public/mutations": typeof marketplace_rankings_public_mutations;
  "marketplace/rankings/public/queries": typeof marketplace_rankings_public_queries;
  "marketplace/rankings/seed/actions": typeof marketplace_rankings_seed_actions;
  "marketplace/rankings/seed/cleanup": typeof marketplace_rankings_seed_cleanup;
  "marketplace/rankings/seed/curatedResolver": typeof marketplace_rankings_seed_curatedResolver;
  "marketplace/rankings/seed/lifecycle": typeof marketplace_rankings_seed_lifecycle;
  "marketplace/rankings/seed/naming": typeof marketplace_rankings_seed_naming;
  "marketplace/rankings/seed/plan": typeof marketplace_rankings_seed_plan;
  "marketplace/rankings/seed/rows": typeof marketplace_rankings_seed_rows;
  "marketplace/rankings/seed/scoring": typeof marketplace_rankings_seed_scoring;
  "marketplace/rankings/seed/validators": typeof marketplace_rankings_seed_validators;
  "marketplace/seedAuth": typeof marketplace_seedAuth;
  "marketplace/seedPipeline/activation": typeof marketplace_seedPipeline_activation;
  "marketplace/seedPipeline/diagnostics": typeof marketplace_seedPipeline_diagnostics;
  "marketplace/seedPipeline/media": typeof marketplace_seedPipeline_media;
  "marketplace/seedPipeline/mediaLookup": typeof marketplace_seedPipeline_mediaLookup;
  "marketplace/seedPipeline/resolvers": typeof marketplace_seedPipeline_resolvers;
  "marketplace/seedPipeline/runs": typeof marketplace_seedPipeline_runs;
  "marketplace/seedPipeline/storageUploads": typeof marketplace_seedPipeline_storageUploads;
  "marketplace/seedPipeline/templates": typeof marketplace_seedPipeline_templates;
  "marketplace/seedPipeline/types": typeof marketplace_seedPipeline_types;
  "marketplace/seedPipeline/validators": typeof marketplace_seedPipeline_validators;
  "marketplace/seedRuns": typeof marketplace_seedRuns;
  "marketplace/templates/bookmarks": typeof marketplace_templates_bookmarks;
  "marketplace/templates/criteria": typeof marketplace_templates_criteria;
  "marketplace/templates/internal": typeof marketplace_templates_internal;
  "marketplace/templates/lib/board": typeof marketplace_templates_lib_board;
  "marketplace/templates/lib/normalize": typeof marketplace_templates_lib_normalize;
  "marketplace/templates/lib/projections": typeof marketplace_templates_lib_projections;
  "marketplace/templates/lib/state": typeof marketplace_templates_lib_state;
  "marketplace/templates/lib/trending": typeof marketplace_templates_lib_trending;
  "marketplace/templates/lib/writes": typeof marketplace_templates_lib_writes;
  "marketplace/templates/mutations": typeof marketplace_templates_mutations;
  "marketplace/templates/queries": typeof marketplace_templates_queries;
  "marketplace/templates/seed": typeof marketplace_templates_seed;
  "platform/media/internal": typeof platform_media_internal;
  "platform/media/queries": typeof platform_media_queries;
  "platform/media/uploads": typeof platform_media_uploads;
  "platform/preferences/mutations": typeof platform_preferences_mutations;
  "platform/preferences/queries": typeof platform_preferences_queries;
  "platform/profile/queries": typeof platform_profile_queries;
  "platform/shortLinks/internal": typeof platform_shortLinks_internal;
  "platform/shortLinks/listing": typeof platform_shortLinks_listing;
  "platform/shortLinks/mutations": typeof platform_shortLinks_mutations;
  "platform/shortLinks/queries": typeof platform_shortLinks_queries;
  "platform/showcase/internal": typeof platform_showcase_internal;
  "platform/showcase/lib": typeof platform_showcase_lib;
  "platform/showcase/mutations": typeof platform_showcase_mutations;
  "platform/showcase/queries": typeof platform_showcase_queries;
  "platform/showcase/validators": typeof platform_showcase_validators;
  users: typeof users;
  "workspace/boards/cloudFields": typeof workspace_boards_cloudFields;
  "workspace/boards/internal": typeof workspace_boards_internal;
  "workspace/boards/librarySummary": typeof workspace_boards_librarySummary;
  "workspace/boards/mutations": typeof workspace_boards_mutations;
  "workspace/boards/queries": typeof workspace_boards_queries;
  "workspace/boards/sourceFields": typeof workspace_boards_sourceFields;
  "workspace/boards/upsertBoardState": typeof workspace_boards_upsertBoardState;
  "workspace/sync/boardReconciler": typeof workspace_sync_boardReconciler;
  "workspace/sync/boardStateLoader": typeof workspace_sync_boardStateLoader;
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

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
