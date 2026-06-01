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
import type * as dev_setPlan from "../dev/setPlan.js";
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
import type * as marketplace_rankings_public_aggregateQueries from "../marketplace/rankings/public/aggregateQueries.js";
import type * as marketplace_rankings_public_mutations from "../marketplace/rankings/public/mutations.js";
import type * as marketplace_rankings_public_queries from "../marketplace/rankings/public/queries.js";
import type * as marketplace_seed_auth from "../marketplace/seed/auth.js";
import type * as marketplace_seed_lib_activation from "../marketplace/seed/lib/activation.js";
import type * as marketplace_seed_lib_diagnostics from "../marketplace/seed/lib/diagnostics.js";
import type * as marketplace_seed_lib_media from "../marketplace/seed/lib/media.js";
import type * as marketplace_seed_lib_mediaLookup from "../marketplace/seed/lib/mediaLookup.js";
import type * as marketplace_seed_lib_resolvers from "../marketplace/seed/lib/resolvers.js";
import type * as marketplace_seed_lib_runRecords from "../marketplace/seed/lib/runRecords.js";
import type * as marketplace_seed_lib_storageUploads from "../marketplace/seed/lib/storageUploads.js";
import type * as marketplace_seed_lib_templates from "../marketplace/seed/lib/templates.js";
import type * as marketplace_seed_lib_types from "../marketplace/seed/lib/types.js";
import type * as marketplace_seed_lib_validators from "../marketplace/seed/lib/validators.js";
import type * as marketplace_seed_rankings_actions from "../marketplace/seed/rankings/actions.js";
import type * as marketplace_seed_rankings_cleanup from "../marketplace/seed/rankings/cleanup.js";
import type * as marketplace_seed_rankings_curatedResolver from "../marketplace/seed/rankings/curatedResolver.js";
import type * as marketplace_seed_rankings_lifecycle from "../marketplace/seed/rankings/lifecycle.js";
import type * as marketplace_seed_rankings_naming from "../marketplace/seed/rankings/naming.js";
import type * as marketplace_seed_rankings_plan from "../marketplace/seed/rankings/plan.js";
import type * as marketplace_seed_rankings_rows from "../marketplace/seed/rankings/rows.js";
import type * as marketplace_seed_rankings_scoring from "../marketplace/seed/rankings/scoring.js";
import type * as marketplace_seed_rankings_tasks from "../marketplace/seed/rankings/tasks.js";
import type * as marketplace_seed_rankings_validators from "../marketplace/seed/rankings/validators.js";
import type * as marketplace_seed_rankings_writes from "../marketplace/seed/rankings/writes.js";
import type * as marketplace_seed_templates_endpoints from "../marketplace/seed/templates/endpoints.js";
import type * as marketplace_seed_templates_maintenance from "../marketplace/seed/templates/maintenance.js";
import type * as marketplace_templates_bookmarks from "../marketplace/templates/bookmarks.js";
import type * as marketplace_templates_criteria from "../marketplace/templates/criteria.js";
import type * as marketplace_templates_internal from "../marketplace/templates/internal.js";
import type * as marketplace_templates_lib_board from "../marketplace/templates/lib/board.js";
import type * as marketplace_templates_lib_normalize from "../marketplace/templates/lib/normalize.js";
import type * as marketplace_templates_lib_projections from "../marketplace/templates/lib/projections.js";
import type * as marketplace_templates_lib_publishing from "../marketplace/templates/lib/publishing.js";
import type * as marketplace_templates_lib_state from "../marketplace/templates/lib/state.js";
import type * as marketplace_templates_lib_styles from "../marketplace/templates/lib/styles.js";
import type * as marketplace_templates_lib_trending from "../marketplace/templates/lib/trending.js";
import type * as marketplace_templates_lib_writes from "../marketplace/templates/lib/writes.js";
import type * as marketplace_templates_mutations from "../marketplace/templates/mutations.js";
import type * as marketplace_templates_publishJobs from "../marketplace/templates/publishJobs.js";
import type * as marketplace_templates_queries from "../marketplace/templates/queries.js";
import type * as platform_account_avatar from "../platform/account/avatar.js";
import type * as platform_account_cardSync from "../platform/account/cardSync.js";
import type * as platform_account_cascadeDelete from "../platform/account/cascadeDelete.js";
import type * as platform_account_password from "../platform/account/password.js";
import type * as platform_account_profile from "../platform/account/profile.js";
import type * as platform_account_sessions from "../platform/account/sessions.js";
import type * as platform_media_internal from "../platform/media/internal.js";
import type * as platform_media_queries from "../platform/media/queries.js";
import type * as platform_media_uploads from "../platform/media/uploads.js";
import type * as platform_preferences_mutations from "../platform/preferences/mutations.js";
import type * as platform_preferences_queries from "../platform/preferences/queries.js";
import type * as platform_shortLinks_internal from "../platform/shortLinks/internal.js";
import type * as platform_shortLinks_listing from "../platform/shortLinks/listing.js";
import type * as platform_shortLinks_mutations from "../platform/shortLinks/mutations.js";
import type * as platform_shortLinks_queries from "../platform/shortLinks/queries.js";
import type * as schema_marketplace from "../schema/marketplace.js";
import type * as schema_platform from "../schema/platform.js";
import type * as schema_profile from "../schema/profile.js";
import type * as schema_seed from "../schema/seed.js";
import type * as schema_workspace from "../schema/workspace.js";
import type * as social_profile_queries from "../social/profile/queries.js";
import type * as social_showcase_internal from "../social/showcase/internal.js";
import type * as social_showcase_lib from "../social/showcase/lib.js";
import type * as social_showcase_mutations from "../social/showcase/mutations.js";
import type * as social_showcase_queries from "../social/showcase/queries.js";
import type * as social_showcase_validators from "../social/showcase/validators.js";
import type * as users from "../users.js";
import type * as workspace_boards_cloudFields from "../workspace/boards/cloudFields.js";
import type * as workspace_boards_internal from "../workspace/boards/internal.js";
import type * as workspace_boards_librarySummary from "../workspace/boards/librarySummary.js";
import type * as workspace_boards_mutations from "../workspace/boards/mutations.js";
import type * as workspace_boards_queries from "../workspace/boards/queries.js";
import type * as workspace_boards_sourceFields from "../workspace/boards/sourceFields.js";
import type * as workspace_boards_switchImageStyle from "../workspace/boards/switchImageStyle.js";
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
  "dev/setPlan": typeof dev_setPlan;
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
  "marketplace/rankings/public/aggregateQueries": typeof marketplace_rankings_public_aggregateQueries;
  "marketplace/rankings/public/mutations": typeof marketplace_rankings_public_mutations;
  "marketplace/rankings/public/queries": typeof marketplace_rankings_public_queries;
  "marketplace/seed/auth": typeof marketplace_seed_auth;
  "marketplace/seed/lib/activation": typeof marketplace_seed_lib_activation;
  "marketplace/seed/lib/diagnostics": typeof marketplace_seed_lib_diagnostics;
  "marketplace/seed/lib/media": typeof marketplace_seed_lib_media;
  "marketplace/seed/lib/mediaLookup": typeof marketplace_seed_lib_mediaLookup;
  "marketplace/seed/lib/resolvers": typeof marketplace_seed_lib_resolvers;
  "marketplace/seed/lib/runRecords": typeof marketplace_seed_lib_runRecords;
  "marketplace/seed/lib/storageUploads": typeof marketplace_seed_lib_storageUploads;
  "marketplace/seed/lib/templates": typeof marketplace_seed_lib_templates;
  "marketplace/seed/lib/types": typeof marketplace_seed_lib_types;
  "marketplace/seed/lib/validators": typeof marketplace_seed_lib_validators;
  "marketplace/seed/rankings/actions": typeof marketplace_seed_rankings_actions;
  "marketplace/seed/rankings/cleanup": typeof marketplace_seed_rankings_cleanup;
  "marketplace/seed/rankings/curatedResolver": typeof marketplace_seed_rankings_curatedResolver;
  "marketplace/seed/rankings/lifecycle": typeof marketplace_seed_rankings_lifecycle;
  "marketplace/seed/rankings/naming": typeof marketplace_seed_rankings_naming;
  "marketplace/seed/rankings/plan": typeof marketplace_seed_rankings_plan;
  "marketplace/seed/rankings/rows": typeof marketplace_seed_rankings_rows;
  "marketplace/seed/rankings/scoring": typeof marketplace_seed_rankings_scoring;
  "marketplace/seed/rankings/tasks": typeof marketplace_seed_rankings_tasks;
  "marketplace/seed/rankings/validators": typeof marketplace_seed_rankings_validators;
  "marketplace/seed/rankings/writes": typeof marketplace_seed_rankings_writes;
  "marketplace/seed/templates/endpoints": typeof marketplace_seed_templates_endpoints;
  "marketplace/seed/templates/maintenance": typeof marketplace_seed_templates_maintenance;
  "marketplace/templates/bookmarks": typeof marketplace_templates_bookmarks;
  "marketplace/templates/criteria": typeof marketplace_templates_criteria;
  "marketplace/templates/internal": typeof marketplace_templates_internal;
  "marketplace/templates/lib/board": typeof marketplace_templates_lib_board;
  "marketplace/templates/lib/normalize": typeof marketplace_templates_lib_normalize;
  "marketplace/templates/lib/projections": typeof marketplace_templates_lib_projections;
  "marketplace/templates/lib/publishing": typeof marketplace_templates_lib_publishing;
  "marketplace/templates/lib/state": typeof marketplace_templates_lib_state;
  "marketplace/templates/lib/styles": typeof marketplace_templates_lib_styles;
  "marketplace/templates/lib/trending": typeof marketplace_templates_lib_trending;
  "marketplace/templates/lib/writes": typeof marketplace_templates_lib_writes;
  "marketplace/templates/mutations": typeof marketplace_templates_mutations;
  "marketplace/templates/publishJobs": typeof marketplace_templates_publishJobs;
  "marketplace/templates/queries": typeof marketplace_templates_queries;
  "platform/account/avatar": typeof platform_account_avatar;
  "platform/account/cardSync": typeof platform_account_cardSync;
  "platform/account/cascadeDelete": typeof platform_account_cascadeDelete;
  "platform/account/password": typeof platform_account_password;
  "platform/account/profile": typeof platform_account_profile;
  "platform/account/sessions": typeof platform_account_sessions;
  "platform/media/internal": typeof platform_media_internal;
  "platform/media/queries": typeof platform_media_queries;
  "platform/media/uploads": typeof platform_media_uploads;
  "platform/preferences/mutations": typeof platform_preferences_mutations;
  "platform/preferences/queries": typeof platform_preferences_queries;
  "platform/shortLinks/internal": typeof platform_shortLinks_internal;
  "platform/shortLinks/listing": typeof platform_shortLinks_listing;
  "platform/shortLinks/mutations": typeof platform_shortLinks_mutations;
  "platform/shortLinks/queries": typeof platform_shortLinks_queries;
  "schema/marketplace": typeof schema_marketplace;
  "schema/platform": typeof schema_platform;
  "schema/profile": typeof schema_profile;
  "schema/seed": typeof schema_seed;
  "schema/workspace": typeof schema_workspace;
  "social/profile/queries": typeof social_profile_queries;
  "social/showcase/internal": typeof social_showcase_internal;
  "social/showcase/lib": typeof social_showcase_lib;
  "social/showcase/mutations": typeof social_showcase_mutations;
  "social/showcase/queries": typeof social_showcase_queries;
  "social/showcase/validators": typeof social_showcase_validators;
  users: typeof users;
  "workspace/boards/cloudFields": typeof workspace_boards_cloudFields;
  "workspace/boards/internal": typeof workspace_boards_internal;
  "workspace/boards/librarySummary": typeof workspace_boards_librarySummary;
  "workspace/boards/mutations": typeof workspace_boards_mutations;
  "workspace/boards/queries": typeof workspace_boards_queries;
  "workspace/boards/sourceFields": typeof workspace_boards_sourceFields;
  "workspace/boards/switchImageStyle": typeof workspace_boards_switchImageStyle;
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
