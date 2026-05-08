---
title: Whole-Codebase Simplify Review — 2026-05-06
description: Reuse / Quality / Efficiency findings across src/, convex/, packages/contracts/. Nine parallel review agents — six fully completed, three cut off by usage limit and flagged PARTIAL.
date: 2026-05-06
branch: feat/marketplace-ranking-aggregates
---

# Whole-Codebase Simplify Review — 2026-05-06

This began as a findings-only report. The original review made no code changes; the implementation phase plan and closure notes were added afterward as the cleanup work landed. Nine parallel review agents covered three axes (reuse, quality, efficiency) × three zones (`src/features/`, `src/shared/` + `src/app/`, Convex backend + `packages/contracts/`).

> [!IMPORTANT]
> **Pre-1.0 framing**: breaking changes are welcome. No data/backwards-compatibility needs to be preserved. Per `CLAUDE.md` § "legacy, migrations, & structural cleanups", delete structural/internal legacy bridges aggressively.

> [!NOTE]
> **Three sections were originally cut off by usage-limit reset.** A second-pass top-up was run after the limit reset; the gap-filling deltas are at §11 below (organized by the original partial section). The original partial sections (§7, §8, §9) are kept as written; §11 is purely additive.

Findings are NOT fixes. Each item is phrased as a problem plus a suggested direction; implementation requires human judgment on priority and sequencing.

**Relationship to prior reviews**:

- `dev-docs/archive/simplify-review-2026-04-16.mdx` (~1090 lines) and `dev-docs/archive/simplify-review-2026-04-18.mdx` (~10 commits ago) are the baselines. The 2026-04-18 review's biggest items have status updates noted inline below.
- Major fixes since 2026-04-18: `useCloudSync` god hook reduced from 542 → 57 lines (verified at `src/features/platform/sync/orchestration/useCloudSync.ts`); `BoardId | ''` sentinel replaced by `BoardId | null` per `useWorkspaceBoardRegistryStore`; `bySnapshotStorageId` full-table scan in media GC fixed; 4 of the 8 dead schema indexes from prior review reclaimed.
- Major debt still open: ConvexError migration (5 plain `throw new Error` sites remain); 8 schema-index cleanup candidates; unbounded module-level caches; per-slice cloud-sync still triplicated.

---

## 0. Coverage status

| §    | Axis              | Zone                                             | Status                       | Tokens / wall time |
| ---- | ----------------- | ------------------------------------------------ | ---------------------------- | ------------------ |
| 2    | Reuse             | `src/features/`                                  | ✅ complete                  | 348k / 8m13s       |
| 3    | Reuse             | `src/shared/` + `src/app/`                       | ✅ complete                  | 315k / 10m15s      |
| 4    | Reuse             | Convex backend + contracts                       | ✅ complete                  | 418k / 8m47s       |
| 5    | Quality           | `src/features/`                                  | ✅ complete                  | 382k / 9m56s       |
| 6    | Quality           | `src/shared/` + `src/app/`                       | ✅ complete                  | 259k / 8m55s       |
| 7    | Quality           | Convex backend + contracts                       | ⚠️ PARTIAL — top-up at §11.1 | 361k / 11m08s      |
| 8    | Efficiency        | `src/features/`                                  | ⚠️ PARTIAL — top-up at §11.2 | 413k / 10m12s      |
| 9    | Efficiency        | `src/shared/` + `src/app/`                       | ⚠️ PARTIAL — top-up at §11.3 | 268k / 9m16s       |
| 10   | Efficiency        | Convex backend + contracts                       | ✅ complete                  | 324k / 7m48s       |
| 11.1 | Quality top-up    | seed scripts, retention crons, platform/\*       | ✅ complete                  | 239k / 12m23s      |
| 11.2 | Efficiency top-up | imageEditor, annotation, preview, library, embed | ✅ complete                  | 164k / 7m14s       |
| 11.3 | Efficiency top-up | board-data, sharing, lib/sync, selection, images | ✅ complete                  | 185k / 9m51s       |

The three ⚠️ PARTIAL sections wrote a closing summary when they sensed the limit. A follow-up pass after the limit reset filled in the gaps — see §11.

---

## 1. Cross-cutting themes — what to tackle first

These are patterns that recurred across multiple agent reports. Solving each removes debt in N places at once. Ordered by blast-radius.

### T1. Eight near-identical async-action hooks (~400 lines)

Flagged independently by **Reuse-features** §A and **Quality-features** §3.

`marketplace/model/usePublishRanking.ts`, `usePublishTemplate.ts`, `useRemixRanking.ts`, `useUseTemplate.ts`, `useUpdateTemplate.ts`, `useOpenTemplateDraft.ts`, `library/model/useCreateLibraryBoard.ts`, `useOpenLibraryBoard.ts` all carry the same skeleton: `useAuthSession` gate → `useState(isPending)` → `useState<string | null>(error)` → `useCallback` body with `try { mutation; toast.success; navigate } catch { logger.error; toast.error; setError } finally { setIsPending(false) }`. All eight format errors via `formatMarketplaceError`; two (`useCreateLibraryBoard`, `useOpenLibraryBoard`) carry the same `pendingRef` mirror-in-render-body workaround.

**Fix**: extract `createAsyncAction({ requireAuth, mutation, successToast, errorContext, onSuccess })` factory or a `useAsyncAction` hook. Collapses ~400 LOC into ~80.

### T2. Marketplace skeleton proliferation (~250 LOC)

Flagged by **Reuse-features** §E. 23 `animate-pulse` markup blocks across features with no shared `<Skeleton>` primitive. Hot spots: `Rail.tsx`, `DraftRail.tsx`, `AccountRankingsSection.tsx`, `AccountTemplatesSection.tsx`, `CommunityConsensusSection.tsx`, `consensus/HeroRailCards.tsx`, `consensus/ConsensusRankingsRail.tsx`, `pages/TemplateDetailPage.tsx`, `pages/RankingDetailPage.tsx`, `pages/TemplatesGalleryPage.tsx`, `library/components/LibrarySkeleton.tsx`. Each re-spells `bg-[rgb(var(--t-overlay)/0.06)]` and `animate-pulse rounded …`.

**Fix**: introduce `~/shared/ui/Skeleton.tsx` with `<SkeletonBlock>`, `<SkeletonText w/h>`, `<SkeletonCard cover bodyLines>`. Removes ~250 LOC of repetitive markup.

### T3. Document-title save/restore duplicated 4× and avatar-initial logic 3×

Flagged by **Reuse-features** §D and §C, **Quality-features** §1.

- `useDocumentTitle(title)` should replace 4 sites: `TemplateDetailPage.tsx:184-193`, `RankingDetailPage.tsx:280-289`, `TemplatesGalleryPage.tsx:123-131`, `MyListsPage.tsx:100-108`.
- `getUserInitial` already exists at `userIdentity.ts:43-44` but only accepts `PublicUserMe`. Marketplace calls `displayName.replace(/^@/, '').slice(0, 1).toUpperCase()` inline at `Card.tsx:179-184`, `TemplateHero.tsx:180-184`, `RankingDetailPage.tsx:354-360`. Generalize to `extractInitial(displayName: string)`.
- The avatar-circle Tailwind chrome (`flex h-N w-N shrink-0 items-center justify-center rounded-full bg-[var(--t-bg-active)] …`) is duplicated 3× — extract `<InitialAvatar>` at the same time.

### T4. Stringly-typed `<select>` change handlers (5 sites cast to typed unions)

Flagged by **Quality-features** §14. Every `<select>` change handler in marketplace/library casts `e.target.value` back to a typed union: `PublishModal.tsx:287` `as TemplateCategory`, `PublishModal.tsx:309` `as TemplateVisibility`, `PublishRankingModal.tsx:157` `as RankingVisibility`, `LibraryFilterBar.tsx:107` `as LibraryBoardSort`, `consensus/ConsensusToolbar.tsx:75` `as TemplateRankingAggregateItemSort`.

**Fix**: shared `typedSelectChangeHandler<T>(setter, isMember)` or a `<TypedSelect>` primitive that takes `options` and a setter; eliminates the cast site-by-site.

### T5. Single-feature consumers in `src/shared/lib/` should move into the feature

Flagged by **Reuse-shared** §2 (10 modules). Pre-1.0, these have one feature consumer and don't earn their `shared/` placement:

- `storageMetering.ts` (5 workspace-only callers) → `features/workspace/boards/data/local/`
- `colorName.ts` (1 caller: `ColorPicker`) → `features/workspace/boards/lib/`
- `useAutoCropCache.ts`, `useCollectAutoCropTransformsRunner.ts`, `autoCrop.ts` (workspace-only) → `features/workspace/imageEditor/lib/` (or a new `autoCrop/` slice)
- `scheduleIdle.ts` (1 caller) → inline at `boardSessionBootstrap.ts`
- `dateFormatting.ts` (2 workspace callers) → merge with marketplace's `formatRelativeTime`
- `useViewportWidth.ts:46-51` (1 caller) → move to `src/app/shells/`
- `useConfirmationGate.ts` (1 caller) → `features/workspace/imageEditor/model/`
- `usePointInTimeQuery.ts` (1 caller) → `features/marketplace/model/`
- `theme/zIndex.ts` (1 caller; the `Z` ladder is otherwise dead) — either wire it up or drop

### T6. Modal/overlay panel chrome string duplicated 3×

Flagged by **Reuse-shared** §4. `BaseModal.tsx:123`, `OverlaySurface.tsx:43`, and `consensus/ItemPopover.tsx:95` each re-spell `rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-overlay)] shadow-2xl`. STILL-OPEN from 2026-04-18 §6.608.

**Fix**: have `BaseModal` render `<OverlayPanelSurface>` (instead of duplicating tokens), and have `consensus/ItemPopover.tsx` route through the shared anchored-popup helpers (which would also fix the inline `mousedown`/`keydown` listeners and viewport-clamp math — see §1.T11).

### T7. Per-slice cloud-sync skeleton still triplicated

STILL-OPEN from 2026-04-18 T9. Flagged by **Reuse-features** §implicit, **Quality-features**.

`features/platform/preferences/data/cloud/cloudMerge.ts`, `features/workspace/tier-presets/data/cloud/cloudMerge.ts`, plus the boards path each implement: subscribe → diff → push or pull → markSynced. The `proceedGuard` helper is shared, but the orchestration is not.

**Fix**: `runFirstLoginMerge<TRemote, TLocal, TResult>({ subscribe, fetchRemote, decide, push, pull, markSynced })` factory.

### T8. Per-tile `useShallow` with too-broad selector

Flagged by **Efficiency-features** §1.

- `workspace/boards/ui/TierItem.tsx:55-92` — every tile subscribes to a 5-field projection that includes `selectHasKeyboardSelection(state)` and the entire `boardLabels` object. Any keyboard-mode flip re-runs this selector for every tile (200+ shallow comparisons on a populated board).
- `workspace/boards/ui/UnrankedPool.tsx:94` — `selectActiveItemCount` is `(state) => Object.keys(state.items).length`. No equality function means every item-content edit re-renders UnrankedPool, AND `Object.keys` allocates a fresh array on every call.
- `getBoardItemAspectRatio(state)` is subscribed in TierList, TierRow, UnrankedPool, DragOverlayItem, ImageEditorModal, ImageEditorPane, and 3 more — same derivation, 9+ consumers, every render.

**Fix**: hoist board-level derivations (`boardAspectRatio`, `boardDefaultFit`, `boardLabels`, `hasKeyboardSelection`) to the WorkspaceShell or TierList level and pass via context/props. Replace `selectActiveItemCount` with a counter maintained in the slice on add/remove.

### T9. `useDismissibleLayer` dep-instability — listener thrash on every render

Flagged by **Efficiency-shared** §12, **Quality-shared** §16.

`src/shared/overlay/dismissibleLayer.ts:158-169` declares `useEffect` deps `[…, ignoreRefs, onPositionUpdate, …]`. Callers commonly pass `ignoreRefs={[fooRef, barRef]}` or `onPositionUpdate={() => updatePosition()}` inline — a fresh array/closure each render. Result: `pointerdown`/`keydown`/`scroll`/`resize` listeners tear down + rebind every render of the consumer.

**Fix**: stabilize via "always-latest" ref pattern (`useEvent`-style). Drop callbacks from deps. The shared utility is the single biggest re-bind churn cause for popups in the shared zone.

### T10. Unbounded module-level caches (memory leaks in long sessions)

Flagged by **Efficiency-shared** §5–6, **Efficiency-features** §8–9.

| File                                                             | Cache                                                    | Status                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| `src/features/marketplace/model/useCompareRanking.ts:32`         | `projectionCache: Map<string, CompareRankingProjection>` | unbounded; placements + buckets per ranking never evict |
| `src/features/workspace/boards/model/usePublishableBoards.ts:36` | `entryCache: Map<BoardId, CachedEntry>`                  | unbounded; stale entries linger after board removal     |
| `src/features/platform/sync/lib/crossTabSyncLock.ts:21`          | `lastAcquiredByPeer: Map<BoardId, number>`               | unbounded; no TTL eviction                              |
| `src/shared/hooks/useViewportWidth.ts:6`                         | `mediaQueryCache: Map<number, MediaQueryList>`           | unbounded; never drops on unsubscribe                   |
| `src/shared/lib/autoCrop.ts:35-37`                               | `scanCache: Map<string, AutoCropScan \| null>`           | unbounded; no IDB-GC coordination                       |
| `src/shared/images/imageStore.ts:50-53`                          | `memoryBlobs`, `memoryUploadIndex`, `memoryBlobRefs`     | unbounded; only the GC pass evicts                      |
| `src/shared/images/imageBlobCache.ts:28-35`                      | `failedCloudRequests`                                    | drains only on `online` event                           |
| `src/shared/board-ui/labelBlocksStyle.ts:56-57`                  | `captionPaddingCache`, `overlayPaddingCache`             | bounded by font-size resolution; minor                  |

**Fix**: add LRU caps; coordinate with IDB GC for `scanCache` and `memoryBlobs`; cap `failedCloudRequests` and clear on board snapshot rotation.

### T11. Marketplace ItemPopover re-implements shared popup primitives

Flagged by **Reuse-features** §K, **Quality-features** §10. `src/features/marketplace/components/consensus/ItemPopover.tsx:49-78` installs its own `mousedown` + `keydown` Escape + scroll listener; lines 80-87 do manual viewport-aware position math (`window.innerWidth`, flip-above logic). `src/shared/overlay/dismissibleLayer.ts` and `src/shared/overlay/anchoredPopup.ts` already provide these behaviors with proper modal-stacking awareness.

**Fix**: route through `useDismissibleLayer({ open, layerRef, onDismiss })` + `useAnchoredPopup`. The stale-anchor-on-scroll bug is now partially mitigated by closing on scroll, but the popover still bypasses shared layer semantics and still computes placement manually.

### T12. Eight dead Convex schema indexes still declared

Flagged by **Reuse-backend** §6 ("dead Convex indexes"), **Quality-backend** §6, **Efficiency-backend** §6.

| File:line              | Index                                               | Why dead                                      |
| ---------------------- | --------------------------------------------------- | --------------------------------------------- |
| `convex/schema.ts:69`  | `users.phone`                                       | possibly required by `authTables` — verify    |
| `convex/schema.ts:371` | `templateMetricDays.byDayTemplate`                  | only `byTemplateDay` is queried               |
| `convex/schema.ts:423` | `templatePublishJobs.byTargetTemplate`              | never `withIndex(...)`                        |
| `convex/schema.ts:443` | `templateCloneJobs.byTargetBoard`                   | never queried                                 |
| `convex/schema.ts:449` | `templateCloneJobs.bySourceTemplateStatus`          | only `byOwnerSourceTemplateStatus` is queried |
| `convex/schema.ts:556` | `publishedRankingItems.byTemplateItem`              | never queried                                 |
| `convex/schema.ts:572` | `templateRankingAggregates.byStateAndUpdatedAt`     | scheduler walks `templateCards` instead       |
| `convex/schema.ts:780` | `templateRankingAggregateJobs.byStatusAndUpdatedAt` | never queried                                 |

Each maintained index taxes every write. Dropping unused indexes immediately reclaims write throughput. Drop the 6 confirmed-dead ones (`byDayTemplate`, `byTargetTemplate`, `byTargetBoard`, `bySourceTemplateStatus`, `byTemplateItem`, `byStatusAndUpdatedAt`); decide whether to wire `byStateAndUpdatedAt` into the aggregate scheduler (it's a more direct query than the current `templateCards` scan) before dropping.

### T13. Five plain `throw new Error` sites — ConvexError migration incomplete

Flagged by **Reuse-backend** §4, **Quality-backend** §2. STILL-OPEN from 2026-04-18 T8.

- `convex/platform/media/internal.ts:96, 106, 114` — three throws in `normalizeVerifiedVariants` (count out of range, duplicate variant kind, missing tile). `convex/platform/media/uploads.ts:118` already throws the same condition through `ConvexError` — clients see two different error shapes from the same logical failure.
- `convex/lib/imageValidation.ts:58` — dimensions out of range (called from action; bubbles up opaque)
- `convex/lib/imageValidation.ts:237` — malformed image payload

**Fix**: `throw new ConvexError({ code: CONVEX_ERROR_CODES.invalidInput, message })` at each site (`payloadTooLarge` for the dimensions case). Codes already exist in `packages/contracts/platform/errors.ts`.

### T14. Heavy synchronous main-thread work on share/import path

Flagged by **Efficiency-shared** §3, §7.

- `src/shared/sharing/hashShare.ts:75-83` — `compressSnapshotPayloadBytes` does `JSON.stringify(snapshot)` + `TextEncoder.encode` + pako `deflate` synchronously after lazy-load. Several MB potential payload, no Worker offload.
- `src/shared/board-data/boardWireMapper.ts:217-234` — `prepareInlineWireImages` decodes every shared image **twice**: once for hashing (`prepareDataUrlRecord` → `dataUrlToBytes` → `sha256Hex`), once for aspect-ratio (`decodeImageAspectRatioFromSrc` constructs an `<img>` and waits for full decode). Inner `Promise.all` is unbounded.
- `src/shared/sharing/shortLinkCodec.ts:24-32` — `assertShortLinkSnapshotSize` runs **after** the full pipeline. Big boards waste seconds of CPU before failing.

**Fix**: move compression to a Web Worker (Vite supports `?worker` imports). Decode each image once — `createImageBitmap(blob)` returns natural width/height and the bitmap can feed both hash and dimensions. Pre-flight uncompressed JSON size against worst-case ratio before compressing.

### T15. `templateRankingAggregateItems` write amplification (20+ indexes)

Flagged by **Efficiency-backend** §7. Schema declares **20+ multi-column indexes** plus a search index on this table. Every per-item patch in `incrementAggregateItem` (called per ranking item × N rankings) updates all 20 indexes. The search index re-tokenizes `searchText` on every doc write even though `searchText` only depends on `label`/`externalId` — neither change in the increment hot path.

**Fix**: pre-load all aggregate items per (template, generation) into a Map at the start of each ranking pass; reuse across the `Promise.all` instead of N `.unique()` calls. Consider deprecating band-specific sort indexes if query traffic shows a few sorts dominate. Investigate splitting the increment into two phases: counters/distribution to one row, sort fields materialized only on job completion.

### T16. `getTemplatesGallery` returns 5 rails in one query — subscription amplification

Flagged by **Efficiency-backend** §15.

`getTemplatesGallery` returns featured + trending + popular + recent + results + stats + viewer plan in a single query. Every page load that mounts the gallery subscribes to all 5 rails. A change in any rail (e.g. trending recompute) re-runs the entire query for every subscribed client.

**Fix**: split into per-rail queries (`getTemplateGalleryRail({ rail })`). Consumers subscribe only to the rails they render.

### T17. `templateCards` row mixes high-churn counters + denormalized author fields + sort fields

Flagged by **Efficiency-backend** §16. Every counter increment (`useCount`, `viewCount`) and every author profile change (`syncTemplateCardsForAuthor`) re-emits the entire row to all subscribers. A user updating their display name fans out to all their template cards' subscribers.

**Fix**: move counters to a separate `templateCardCounters` table joined at read time (or already-present `templateStats`); or accept the amplification but ensure no further fields accrete onto `templateCards`.

### T18. Two `.collect()` in seed scripts — txn-cap risk

Flagged by **Efficiency-backend** §1. `convex/marketplace/templates/seed.ts:625` (`recomputeTemplateTagsImpl`) and `:787` (`clearSeededTemplateCovers`) call `await ctx.db.query('templates').collect()`. Dev-only paths but unbounded — risks blowing the 4096-read mutation cap as the seeded dataset grows.

**Fix**: paginate via `.paginate({ numItems: 100 })` and self-schedule, mirroring `recomputeTemplateCardsBatchImpl`.

### T19. Dead public Convex functions and dead frontend façades

Flagged by **Quality-backend** §6.

Backend (no caller in `src/`, `scripts/`, `tests/`, `e2e/`):

- `convex/workspace/boards/mutations.ts:17` — `createBoard`
- `convex/workspace/boards/mutations.ts:52` — `updateBoardMeta`
- `convex/workspace/boards/queries.ts:87` — `getBoardByExternalId`
- `convex/workspace/tierPresets/mutations.ts:80` — `updateTierPreset`
- 5 dev-only seed actions (`recomputeMarketplaceStats`, `recomputeTemplateTags`, `recomputeTemplateCards`, `unpublishSeededTemplate`, `clearSeededCovers`) — keep but document dashboard-only

Frontend (pure pass-through facades):

- `src/features/marketplace/model/useRankingPublishAvailability.ts` — 9-line wrapper
- `src/features/marketplace/model/useRankingDetail.ts`, `useTemplateDetail.ts` — bare re-exports

### T20. Inline ID-prefix string checks duplicate `packages/contracts/lib/ids.ts` brand types

Flagged by **Quality-backend** §8.

- `convex/workspace/boards/upsertBoardState.ts:168` — `if (!args.boardExternalId.startsWith('board-'))` (no `isBoardId` helper exists; add one)
- `convex/workspace/boards/upsertBoardState.ts:192` — `if (!tier.externalId.startsWith('tier-'))` — `isTierId` already exists at `packages/contracts/lib/ids.ts:44`
- `convex/workspace/boards/upsertBoardState.ts:242` — media externalId prefix check (no helper exists)
- `convex/workspace/tierPresets/mutations.ts:24` — preset prefix check — `isUserPresetId` already exists at `lib/ids.ts:49`

### T21. `crons.ts` trending recompute scans private templates hourly

Flagged by **Efficiency-backend** §1, §8.

`recomputeTemplateTrendingScores` paginates `templateCards` without an index filter — walks every row, public AND private, every hour. Many private templates can be inert; paying their read cost every hour is wasteful.

**Fix**: use `.withIndex('byIsPubliclyListableUpdatedAt', q => q.eq('isPubliclyListable', true))`. Drop frequency to ≥4h. Track `lastTrendingDirty` to avoid no-op recomputes.

---

## 1A. Phases - execution order

This section is the implementation map for the whole review. Every finding in §2-§11 should land in one of these phases; the detailed evidence stays in the original finding sections. If a finding appears in more than one phase, the earlier phase owns the enabling cleanup and the later phase owns the deeper behavior or architecture change.

The phases are intentionally ordered by dependency and risk. Early phases delete dead code, normalize shared primitives, and make the project easier to navigate. Later phases handle render hot paths, browser data pipelines, and backend architecture where behavior and scaling tradeoffs need more care.

**How to use this plan**:

- Treat each phase as a reviewable batch. Do not mix a broad file move with behavior changes unless the behavior change is tiny and directly required by the move.
- Start each phase by re-verifying its findings against current code; some items may already be fixed by intervening work.
- Prefer breaking cleanup over compatibility layers. This codebase is pre-1.0, so old internal shapes should be deleted instead of bridged unless a task explicitly asks to preserve old data.
- Keep the phase boundary honest. If a fix exposes a higher-risk problem, record it under the later owning phase instead of expanding the current phase until it becomes unreviewable.
- After each phase, update this document with fixed, deferred, or accepted status for the findings touched by that phase.

### Phase 1. Backend hygiene, validation consistency, and low-risk write wins

**Goal**: remove low-risk backend debt before larger frontend and backend architecture work.

**Finding coverage**: `T12`, `T13`, backend portion of `T19`, `T20`, `T21`, selected `T18`, low-risk §4 backend reuse items, §7.2, §7.6-§7.8, §7.12-§7.14, §7T seed/cron/auth items, and §10.1/§10.6/§10.8 items that are pure cleanup.

**Work items**:

- Drop confirmed-dead Convex schema indexes and remove dead public Convex functions.
- Finish the `ConvexError` migration and keep error codes aligned with `packages/contracts/platform/errors.ts`.
- Replace inline ID-prefix checks with shared contract guards.
- Tighten obvious backend types and validators where no migration bridge is needed.
- Convert unbounded seed/dev maintenance scans to pagination.
- Make trending recompute public-only and reduce no-op cron work.
- Document dashboard-only seed actions instead of treating them as frontend API surface.
- Keep `users.phone` unless Convex Auth documentation or generated auth table requirements prove it is unused.

**Risk**: low to medium. Most changes are deletion, index cleanup, validator consistency, or narrower indexed reads.

**Done when**: Convex codegen succeeds, targeted Convex tests pass, dead-code audit has no new backend findings from this phase, and no public frontend callsites reference removed functions.

### Phase 2. Shared primitives and small cross-slice duplication

**Goal**: create the small shared pieces that make later marketplace, library, and shared-layer cleanup cheaper.

**Finding coverage**: `T1`, `T2`, `T3`, `T4`, `T6`, `T11`, most of §2.A-§2.O, §3.1, §3.3-§3.6, §4.1-§4.4 where helper extraction is small, §5.3, §5.5, §5.16, and §6.3-§6.5.

**Work items**:

- Extract `useAsyncAction` or equivalent for marketplace/library mutation flows.
- Add a small skeleton primitive and replace repeated `animate-pulse` blocks.
- Add `useDocumentTitle`, an initial/avatar primitive, a marketplace breadcrumb, and a marketplace not-found component.
- Add a typed select helper or primitive to eliminate repeated union casts.
- Route modal and popup chrome through shared overlay surfaces.
- Move `ItemPopover` onto shared dismissible/anchored popup behavior.
- Consolidate search inputs, dark cover pills, visibility chips, badge labels, publish metadata fields, and segmented controls.
- Replace local clipboard, canvas-resize, URL, pluralize, and error-formatting helpers with canonical shared helpers.
- Keep new primitives small. If an abstraction needs many booleans immediately, use explicit variants or composition instead.

**Risk**: low to medium. Most work should preserve behavior and reduce repeated markup or hook scaffolding.

**Done when**: the repeated patterns cited in §2-§3 have a canonical owner, callsites import from that owner directly, and the shared primitive does not introduce a broad all-purpose API.

### Phase 3. Directory restructure and ownership cleanup

**Goal**: make large directories navigable and move single-feature utilities back to their owners without creating a deep folder maze.

**Finding coverage**: `T5`, structural parts of §2.R, §3.2, §3.8, §3.9, §5.4, §5.17, and large-directory cleanup implied by the `src/features/` and `src/shared/` findings.

**Marketplace component restructure**:

`src/features/marketplace/components` is the main restructure target. It has dozens of unrelated top-level files while only `consensus/` has a domain folder. After Phase 2 reduces repeated primitives, group the remaining files by product surface:

```txt
src/features/marketplace/components/
  account/
    AccountRankingsSection.tsx
    AccountTemplatesSection.tsx
  cards/
    Card.tsx
    CreateTile.tsx
    RecommendedPresetCard.tsx
    UseTemplateButton.tsx
  consensus/
    existing consensus files
  cover/
    Cover.tsx
    CoverImageEditor.tsx
    CoverImageInput.tsx
    FramedCoverImage.tsx
    MediaMatteFrame.tsx
    coverFramingStyles.ts
  discovery/
    CategoryChips.tsx
    CommunityConsensusSection.tsx
    DraftRail.tsx
    Hero.tsx
    InitialsGrid.tsx
    Mosaic.tsx
    Rail.tsx
    RailHeader.tsx
    SearchInput.tsx
    mosaicGrid.ts
  layout/
    Footer.tsx
  publish/
    BoardPicker.tsx
    PublishModal.tsx
    PublishRankingModal.tsx
    TagsInput.tsx
    loadPublishModal.ts
    publishBoardSelection.ts
  template/
    ShareTemplateButton.tsx
    TemplateHero.tsx
```

This is a starting map, not a mandate to preserve every filename. If Phase 2 deletes or merges a file, do not carry the old shape forward just to match this tree.

**Other large directories**:

- `src/features/marketplace/model` is the second marketplace cleanup target after components. Keep it flatter than components for now, but group obvious families only if Phase 2 leaves enough files to justify it: publish/remix/open action hooks, detail/gallery query adapters, account mutations, and consensus projections. Avoid creating one folder per hook.
- `src/features/marketplace/data` is small enough to stay flat unless cover upload, repository adapters, and media helpers keep growing independently. If it splits, prefer `repositories/` and `cover/` over generic `utils/`.
- `src/features/workspace/boards` is large but already split into `dnd/`, `interaction/`, `lib/`, `model/`, and `ui/`. Avoid a wholesale move. If Phase 5 touches the hot UI path, consider grouping `ui/` into `tier-list/`, `menus/`, and `board-actions/` only where it improves ownership.
- `src/features/workspace/settings` is moderately large and already follows `lib/`, `model/`, and `ui/`. Keep it unless the aspect-ratio flow keeps growing; then split a focused `aspectRatio/` sub-slice.
- `src/features/workspace/imageEditor` is sizable but coherent. Prefer targeted splits after Phase 5, such as `pane/`, `rail/`, `labels/`, and `autoCrop/`, only if the performance work leaves files hard to reason about.
- `src/features/workspace/annotation` is compact but behaviorally sensitive. Do not restructure it before Phase 5's redraw/history work; split canvas state from toolbar/persistence only if the performance fix needs clearer ownership.
- `src/features/workspace/preview` is small. Leave it alone unless Phase 5/6 changes make preview loading or image subscription ownership clearer.
- `src/features/library/components` is not large enough to justify structure churn. Shared primitives from Phase 2 should reduce its duplication without moving the directory.
- `src/shared/lib` should shrink by ownership, not by arbitrary nesting. Move workspace-only auto-crop helpers to image editor ownership, storage-metering helpers to board local storage ownership, board snapshot helpers to `shared/board-data`, image transform helpers to `shared/board-ui`, and sync helpers to `features/platform/sync/lib`.
- `src/shared/images`, `src/shared/board-data`, and `src/shared/sharing` should remain domain folders, but Phase 6 may split heavy worker/cache code from public helpers if those files keep growing.
- `src/shared/ui` and `src/shared/overlay` should keep their flat-ish primitive layout. Refactor APIs before moving files.

**Phase 3 sequencing**:

1. Move marketplace component files by product surface after Phase 2 decides which files still exist.
2. Move single-feature helpers out of `src/shared/` and into their owning feature slices.
3. Re-run import cleanup and dead-code audit so moved files do not leave aliases, facades, or stale path references.
4. Update architecture/dev docs with only durable ownership rules; do not duplicate the full file tree in long-term docs.

**Guardrails**:

- No barrels. Import directly from the defining file.
- Move files in domain batches and keep behavior changes separate from pure path moves.
- Do not build a folder for a single tiny helper unless it is clearly the start of a domain.
- Update docs and stale references in the same phase.

**Risk**: medium. File moves create import churn and review noise even when behavior is unchanged.

**Done when**: top-level marketplace components are grouped by domain, single-feature shared helpers have moved to their owners, and import paths reflect ownership boundaries.

### Phase 4. Frontend quality, component APIs, and readability

**Goal**: simplify component internals after shared primitives and directory ownership are stable.

**Finding coverage**: most of §5 and §6 quality findings not already covered by Phases 2-3, including §5.1-§5.2, §5.6-§5.15, §5.18, §6.1-§6.2, §6.7-§6.11, §6.14-§6.20, and lower-risk app-shell cleanup.

**Work items**:

- Convert publish flow state to a reducer or discriminated form mode.
- Replace boolean-prop combinations with explicit variants or composed subcomponents.
- Group sprawling props in `BoardActionBar`, annotation UI, modal APIs, and related controller hooks.
- Split very large JSX blocks: `CommunityConsensusSection`, `PublishModal`, `TemplateHero`, `Card`, `MyListsPage`, and `BoardActionBar`.
- Replace nested conditional render branches with small state-to-component mappings where that clarifies behavior.
- Remove dead frontend facades and trivial single-use factories.
- Normalize direct `console.error` and raw `error.message` sites through the logger/error formatter.
- Remove unnecessary comments, unnecessary `forwardRef` wrappers, and test-only exports from production paths.
- Clean app-shell duplication, runtime error banner rendering, top-nav capsule drift, and route fallback duplication.

**Risk**: medium. Most changes are internal, but large component splits need visual checks.

**Done when**: component APIs encode states explicitly, the largest components are split along product boundaries, and frontend quality findings that are not intentionally deferred have either been fixed or documented as accepted.

### Phase 5. Frontend render, subscription, and interaction performance

**Goal**: fix hot render paths once component ownership is clear enough to make targeted changes safely.

**Finding coverage**: `T8`, `T9`, §8 render/subscription findings, §8T-1-§8T-14, §8T-17-§8T-23, §9.1-§9.4, §9.9-§9.13, §9.15, §9.17, §9.19-§9.20, and the render-related parts of §11.2-§11.3.

**Work items**:

- Hoist board-level derivations out of per-tile selectors and reduce broad `useShallow` projections.
- Replace `selectActiveItemCount` allocation with maintained or narrowly derived state.
- Stabilize `useDismissibleLayer`, `useViewportWidth`, popup callbacks, and inline callback props that defeat memoization.
- Reduce wide selectors in `WorkspaceShell`, `ImageEditorModal`, `DragOverlayItem`, and other hot UI.
- Fix annotation history redraw and image-editor pane/rail recomputation.
- Reduce drag move/collision work by snapshotting once and passing stable drag-session data.
- Add no-op guards where stores currently replace arrays or objects unnecessarily.
- Avoid duplicate `useImageUrl` subscriptions for primary/fallback images.
- Lazy-load rare routes or auth/sync code where always-mounted imports are measurably wasteful.

**Risk**: medium to high. Selector and interaction changes can break subtle keyboard, drag, editor, or modal behavior.

**Done when**: targeted unit tests pass, manual drag/image-editor/annotation/marketplace smoke checks pass, and performance fixes are tied to the specific hot paths from §8-§9.

### Phase 6. Client data pipeline, images, caches, and share/import CPU

**Goal**: address heavier browser-side scaling issues after UI render behavior is stable.

**Finding coverage**: `T10`, `T14`, §8.8-§8.10, §8.14-§8.18 where image/cache/data-pipeline related, §9.5-§9.8, §9.14-§9.16, §9.18, §9T-10-§9T-16, §9T-19-§9T-21, and cache/memory parts of §11.2-§11.3.

**Work items**:

- Add bounded eviction or lifetime rules for module-level caches.
- Move share/import compression and inflation work to a worker if payload sizes justify it.
- Avoid decoding shared images twice for hash and dimensions.
- Preflight short-link size earlier so large boards fail before expensive work.
- Combine board snapshot traversals and repeated image-ref passes.
- Improve IDB transaction patterns in blob replacement and pruning.
- Cache `localSidecar.load` safely and invalidate on writes.
- Reduce blob hashing memory pressure and repeated canvas allocation.
- Trim session-dedup storage and failed-cloud-request caches.

**Risk**: high. These paths touch persistence, imports, exports, sharing, and long-session memory behavior.

**Done when**: import/share/export flows are covered by focused tests or manual large-board checks, cache caps have explicit policies, and old pre-1.0 data bridges are removed instead of expanded.

### Phase 7. Backend scaling and marketplace aggregate architecture

**Goal**: handle the backend changes that affect query shape, write amplification, subscriptions, and long-running aggregate jobs.

**Finding coverage**: `T15`, `T16`, `T17`, deeper §4.5-§4.10 backend reuse items, §7.15, §7.18, §10.2-§10.5, §10.7-§10.24, and backend scale findings from §11.1.

**Work items**:

- Reduce `templateRankingAggregateItems` write amplification and preload aggregate rows per template/generation.
- Snapshot target bucket labels, tier-bucket maps, and latest-ranking checks onto aggregate jobs where repeated reads are unnecessary.
- Add aggregate job retry/failure state before poison-pill jobs can loop indefinitely.
- Split `getTemplatesGallery` into per-rail queries so subscribers only pay for rendered rails.
- Revisit `templateCards` churn by separating high-churn counters or accepting the tradeoff explicitly.
- Improve media reference checks by denormalizing ownership/publication state where query cost justifies it.
- Replace sequential per-item template lookups with batch loads.
- Tighten cron and GC scans around age/index bounds.
- Revisit bounded `.take()` APIs and pagination consistency for user-owned lists.
- Move aggregate scheduler discovery onto direct aggregate/job indexes instead of broad card scans.

**Risk**: highest. This phase can change schema, query subscriptions, and long-running job semantics.

**Done when**: aggregate jobs can fail safely, list/detail subscriptions are narrower, write amplification has a measured reduction path, and schema/index changes are reflected in generated Convex types.

### Phase 8. Closure pass, accepted tradeoffs, and docs

**Goal**: close the review cleanly after the functional phases land.

**Finding coverage**: remaining quick wins and low-impact items from §2-§11, §12 follow-ups, test-helper cleanup from §4.11/§7.17, small magic-number/comment/type-cast items, and any finding intentionally accepted rather than fixed.

**Work items**:

- Run dead-code audit and remove leftover facades, aliases, and test-only production exports.
- Update docs and dev-docs references that mention removed helpers, old paths, or old behavior.
- Collapse or delete tests that only asserted removed pre-1.0 bridges.
- Record accepted tradeoffs for findings that are intentionally left in place.
- Verify the phase map against every original section and mark unresolved items with their owning phase.
- Run the standard gates for the final cleanup branch.
  **Risk**: low. This is mostly verification, documentation, and long-tail cleanup.

### Phase coverage map

| Source findings          | Owning phase(s)                                     |
| ------------------------ | --------------------------------------------------- |
| §1 cross-cutting T1-T4   | Phase 2                                             |
| §1 T5-T6                 | Phases 2-3                                          |
| §1 T7                    | Phase 7                                             |
| §1 T8-T9                 | Phase 5                                             |
| §1 T10-T11               | Phases 2, 5, and 6                                  |
| §1 T12-T14               | Phases 1 and 6                                      |
| §1 T15-T17               | Phase 7                                             |
| §1 T18-T21               | Phase 1, with remaining seed/scale follow-up in 7-8 |
| §2 feature reuse         | Phases 2-4                                          |
| §3 shared/app reuse      | Phases 2-4                                          |
| §4 backend reuse         | Phases 1, 7, and 8                                  |
| §5 feature quality       | Phases 3-5                                          |
| §6 shared/app quality    | Phases 3-6                                          |
| §7 backend quality       | Phases 1, 7, and 8                                  |
| §8 feature efficiency    | Phases 5-6                                          |
| §9 shared/app efficiency | Phases 5-6                                          |
| §10 backend efficiency   | Phases 1 and 7                                      |
| §11 top-up findings      | Phases 1, 5, 6, 7, and 8                            |
| §12 priority list        | Superseded by this phase plan                       |

## 1B. Implementation status - 2026-05-08

This section records the cleanup branch status after executing the phase plan. The original finding sections below are retained as evidence and review context; this section is the current closure record.

### Completed phases

- **Phase 1 - backend hygiene**: completed by `fix(convex): complete phase 1 backend hygiene`. Removed low-risk dead backend surface, reclaimed confirmed-dead indexes, finished the ConvexError consistency work, replaced inline ID-prefix checks, paginated seed/dev maintenance scans, and narrowed recurring backend maintenance work. `users.phone` stayed because it belongs to the Convex Auth table shape.
- **Phase 2 - shared primitives**: completed by `refactor(ui): complete phase 2 shared primitives`. Added the shared action, skeleton, document-title, avatar, select, overlay, and popup primitives needed to stop marketplace/library duplication from re-forming.
- **Phase 3 - ownership cleanup**: completed by `refactor(structure): complete phase 3 ownership cleanup`. Grouped the large marketplace component directory by product surface, moved single-feature shared helpers back to their owners, and kept imports direct with no barrels.
- **Phase 4 - frontend quality**: completed by `refactor(ui): complete phase 4 cleanup batch`, `refactor(ui): tighten phase 4 component APIs`, and `refactor(ui): remove secondary button ref wrapper`. Simplified component APIs, split large UI blocks where the shared primitives made that useful, and removed facades/test-only exports that were only carrying old structure forward.
- **Phase 5 - render and interaction performance**: completed by the Phase 5 performance commits from `perf(ui): reduce phase 5 listener and library churn` through `perf(dnd): reuse active drag snapshots`. Narrowed hot board subscriptions, maintained active item count directly, reduced listener churn, trimmed editor redraw work, and stabilized drag-session data.
- **Phase 6 - client data pipeline and caches**: completed by `perf(images): bound cache and idb maintenance work`, `perf(share): move snapshot compression off thread`, and `perf(data): trim client cache and encode churn`. Added cache bounds, moved snapshot compression to a worker path, reduced IDB churn, and removed unnecessary encode/decode work from image/share flows.
- **Phase 7 - backend scale and aggregate architecture**: completed by `perf(convex): tighten aggregate and gc jobs`, `perf(marketplace): split gallery rail queries`, `perf(convex): snapshot aggregate tier maps`, and `perf(marketplace): reuse template card media cache`. Aggregate jobs now have retry/failure state, direct scheduler indexes, less repeated per-item loading, narrower gallery subscriptions, and reusable template-card media projection caching.
- **Phase 8 - closure**: completed as the final cleanup pass. `npm run audit:dead-code` is clean after removing leftover accidental exports, obsolete frontend short-link creation facades, stale test fixture exports, and tests/docs references that only existed for removed helpers.

### Accepted or intentionally bounded tradeoffs

- **Convex Auth indexes**: keep `users.phone`; it is part of the generated/auth-owned table shape and was not treated as app-owned dead schema.
- **Dashboard-only seed actions**: keep dev/dashboard seed actions documented as maintenance entry points instead of deleting them as if they were public frontend API.
- **`templateCards` churn split**: do not split counters into a new table yet. Phase 7 reduced the largest subscription/read costs through gallery rail splitting, aggregate job tightening, and projection cache reuse; a new counter table is only worth it once real query traffic proves the extra join complexity pays for itself.
- **Short-link resolution support**: remove the unused frontend creation path, but keep resolve/list/revoke support so existing short-link maintenance and inbound decode paths remain coherent until the whole short-link feature is deliberately retired.
- **Low-impact micro-optimizations**: retain a few documented low-risk observations such as tiny formatting/string-concat costs where the implementation work would add more surface area than it removes. These are not blockers after the higher-leverage cache, worker, render, and Convex-query changes landed.

### Final verification target

The final cleanup branch should finish with:

- `npm run audit:dead-code`
- `npm run format:check`
- `npm run build`
- `npx vitest run --silent=true`

Plain `npm test` can be used too, but this branch has seen an intermittent Vitest environment-teardown failure in the media variants file; the silent full run is the stable final gate used for the cleanup commits.

---

## 2. Code Reuse — `src/features/`

> Status: ✅ complete — 348k tokens, 8m13s.

`src/features/` contains 317 files split across `embed/`, `library/`, `marketplace/`, `platform/`, and `workspace/`. The duplication footprint is **moderate-to-high in the marketplace slice**, **moderate in cross-cutting page chrome (titles, breadcrumbs, NotFound, skeletons, badges, avatars)**, and **mostly clean in workspace boards/sync** (those have absorbed previous simplify-review fixes — generic sync runner, sidecar factory, shared button/text-input primitives are now consistently used outside marketplace). The biggest concrete wins are: (1) two near-byte-identical `useRecord*View` hooks, (2) a `ShareTemplateButton` that re-implements clipboard copy + abort detection that already exists in `useClipboardCopy`/`isAbortError`, (3) a homemade canvas-resize pipeline in `marketplace/data/coverImageUpload.ts` that re-implements `shared/images/imageEncode.ts`, (4) five marketplace orchestration hooks following the same `[isPending, error] + try/catch + toast + navigate` template, (5) two near-identical publish-form modals, (6) avatar-initial computation in 4 places when `getUserInitial` already exists, and (7) repeated `document.title = X · TierListBuilder` save/restore boilerplate across 4 page components.

### A. Cross-feature near-duplicate hooks

- **File**: `src/features/marketplace/model/useRecordRankingView.ts:1-60` & `src/features/marketplace/model/useRecordTemplateView.ts:1-61` — two near-byte-identical session-dedup hooks
  - Duplicate of: each other; pattern not yet shared.
  - What's there: same Set-in-sessionStorage dedup, same try/catch, same `useEffect`, only the storage key (`tlb:rank-view` vs `tlb:tpl-view`) and the imperative function differ.
  - Suggested change: extract `useSessionDedupedAction({storageKey, run})` (or generalize to `useOncePerSessionPerKey`) and call from both. Both files collapse to ~10 lines each.

- **File**: `src/features/marketplace/model/usePublishRanking.ts:31-80` / `usePublishTemplate.ts:34-101` / `useRemixRanking.ts:22-61` / `useUseTemplate.ts:23-69` / `useUpdateTemplate.ts:31-83` / `useOpenTemplateDraft.ts:19-58` — six action hooks share the same scaffolding (see T1).

- **File**: `src/features/library/model/useCreateLibraryBoard.ts:17-49` and `useOpenLibraryBoard.ts:18-57` — two more "set pending → run → toast → navigate" hooks (T1).

### B. Custom utilities re-implementing existing shared helpers

- **File**: `src/features/marketplace/components/ShareTemplateButton.tsx:30-63, 65-88, 91-132` — homemade `copyToClipboard` + transient "copied" timer + manual abort detection
  - Duplicate of: `src/shared/hooks/useClipboardCopy.ts:9-47`, `src/shared/lib/errors.ts:15-16` (`isAbortError`). The button imports `isAbortError` but reinvents the entire timer/copied/clipboard pipeline including a legacy `document.execCommand('copy')` fallback.
  - Suggested change: replace with `useClipboardCopy()`. Drop the legacy `execCommand` fallback or hoist it into `useClipboardCopy` so every site benefits.

- **File**: `src/features/workspace/sharing/ui/RecentSharesModal.tsx:50-98` — implements its own `copiedSlug` + timer + clipboard call. Imports `COPIED_FEEDBACK_MS` from the hook file but doesn't use the hook itself.
  - Suggested change: collapse to per-row `useClipboardCopy()` instances.

- **File**: `src/features/marketplace/data/coverImageUpload.ts:38-93` — `getResizedDimensions`, `canvasToPngBlob`, `resizeImageToPngBlob`
  - Duplicate of: `src/shared/images/imageEncode.ts:12-114`. The shared file already exports `drawImageToPngBlob` byte-for-byte equivalent to `resizeImageToPngBlob`.
  - Suggested change: import from `~/shared/images/imageEncode`.

- **File**: `src/features/marketplace/components/CoverImageInput.tsx:46-71` and `src/features/marketplace/data/coverImageUpload.ts:121-132` — two side-by-side MIME + size validators with diverging error strings (`Max 5MB.` vs `(max 5MB).`).
  - Suggested change: lift `validateUploadedImageFile(file): { ok: true } | { ok: false, message }` into `~/features/platform/media/`.

- **File**: `src/features/marketplace/components/ShareTemplateButton.tsx:20-28` — `buildShareUrl(slug)` wraps `getTemplateDetailPath`
  - Duplicate of: `src/features/platform/share/shortLinkShare.ts:27-28` (`getShareUrlFromSlug`).
  - Suggested change: extract `toAbsoluteAppUrl(path)` next to `buildAppUrl` in `~/shared/sharing/hashShare`.

- **File**: `src/features/library/pages/MyListsPage.tsx:38-39` — inline `foldForSearch` (NFD + diacritic strip + lowercase).
  - Suggested change: lift to `~/shared/lib/text.ts`.

### C. Avatar/initials & author-display patterns

See T3.

### D. Repeated page chrome / page-title / NotFound / breadcrumb

- See T3 for `useDocumentTitle`.
- **File**: `TemplateDetailPage.tsx:45-63` (`NotFound`) and `RankingDetailPage.tsx:159-177` (`NotFound`) — near-identical full-bleed not-found section with `min-h-[60vh]` + back-to-templates link.
  - Suggested change: `<MarketplaceNotFound title body backLabel backTo>` shared component.
- **File**: `RankingDetailPage.tsx:303-328` & `TemplateDetailPage.tsx:206-226` — two near-identical breadcrumb implementations.
  - Suggested change: `<MarketplaceBreadcrumb segments={[{label, to?}]} />`.

### E. Skeleton loading patterns proliferating without a primitive

See T2.

### F. "Dark badge" Tailwind class string proliferation

- **File**: `Card.tsx:132,137,141,148,154`, `Hero.tsx:39,43`, `library/components/BoardCard.tsx:98` — 8 near-identical `rounded-full bg-black/(55|60) px-N py-N text-[10px] font-semibold tracking-wide text-white uppercase backdrop-blur` chips.
  - Suggested change: lift `<CoverPill>` / `<DarkChip>` primitive.

- **File**: `PublishModal.tsx:262-264, 308-313` & `PublishRankingModal.tsx:131-134, 158-161` — same `<textarea>`/`<select>` className inlined four times. `TextArea` exists at `~/shared/ui/TextArea.tsx` but isn't used here.
  - Suggested change: use existing `<TextArea>`; introduce a `<Select>` primitive.

### G. Two publish modals share most of their structure

- **File**: `PublishModal.tsx:198-407` and `PublishRankingModal.tsx:91-197` — both render a form with title + char counter + description textarea + char counter + visibility `<select>` + Cancel/Submit footer.
  - Suggested change: extract `<PublishMetaForm>`. Roughly 100 LOC saved.

### H. Search/filter input duplication

- **File**: `marketplace/components/SearchInput.tsx:50-97` and `library/components/LibrarySearchInput.tsx:12-31` — two pill-style search inputs with the same chrome.
  - Suggested change: a `<PillSearchInput>` primitive in `~/shared/ui/`, optionally accepting a `kbHint`.

### I. Repository pagination & query-args boilerplate

- **File**: `marketplace/data/rankingsRepository.ts:75-96, 134-169` and `templatesRepository.ts:69-84` — three `usePaginatedQuery` wrappers each open-coding `{items, status, loadMore} = {results, status, loadMore}`.
  - Suggested change: `mapPaginatedQuery<T>(page, pageSize)` helper so each adapter is one line.

- **File**: `rankingsRepository.ts:34-40, 49-56, 100-109, 171-180, 191-198` and `templatesRepository.ts:61-67, 102-111, 116-123, 166-173` — every `useQuery` opens with `... typeof slug === 'string' && slug.length > 0 ? {slug} : 'skip'`. `isNonEmptyString` already exists at `src/shared/lib/typeGuards.ts:14-15`.
  - Suggested change: `useConvexQueryWhen(api, args, enabled)` helper, or call `isNonEmptyString` everywhere.

### J. Type aliases & contract shadowing

- **File**: `marketplace/components/consensus/utils.ts:33` exports `ConsensusBandFilter = TemplateRankingAggregateItemBand` — drop the alias.
- **File**: `consensus/utils.ts:52-55` — `isAggregateReady` is a 3-line wrapper around `isTemplateRankingAggregateReady` (`packages/contracts/marketplace/rankingAggregate.ts:51`).
  - Suggested change: re-export or inline the contract version.

### K. Document-side-effect & web-API duplication

See T11 for `ItemPopover`. Plus:

- `TemplateHero.tsx:163-165` — `handlePrint = () => window.print()`. Low-priority shared helper candidate.
- `workspace/boards/ui/ItemContextMenu.tsx:85-86` — `window.innerWidth/innerHeight` inline. STILL-OPEN from prior reviews.

### L. Logger / error-formatting drift

- **File**: `useExportController.ts:95, 191, 219` — direct `console.error('[export]', err)` calls when `logger.error('export', ...)` is the canonical helper. STILL-OPEN against prior simplify-review T18.

- **File**: `marketplace/model/formatters.ts:1-27` defines `formatMarketplaceError` (used in 8 files). The Convex `error.data.message` extraction is universal across Convex apps.
  - Suggested change: lift the Convex-data branch into shared `formatError`; have `formatMarketplaceError` delegate.

- **File**: 4 places use raw `error instanceof Error ? error.message : 'fallback'` in account UI: `AccountDangerZone.tsx:48`, `AccountSessionsSection.tsx:40-43`, `AccountProfileSection.tsx:89`, `SignInModal.tsx:71-75`.
  - Suggested change: replace with `formatError(error, 'fallback')`.

### M. URL builder duplication

- 14 occurrences of inline `` `${TEMPLATES_ROUTE_PATH}/${slug}` `` and `` `${RANKINGS_ROUTE_PATH}/${slug}` `` across features. `getTemplateDetailPath(slug)` and `getRankingDetailPath(slug)` already exist at `src/shared/routes/pathname.ts:34-44`. Only `ShareTemplateButton.tsx:22` uses them.
  - Suggested change: replace inline strings with helpers.

### N. Tabbed-toolbar / segmented-control duplication

- **File**: `consensus/ConsensusToolbar.tsx:108-131, 149-175` (×2 segmented groups), `consensus/ConsensusRankingsRail.tsx:92-121`, `library/components/LibraryFilterBar.tsx:122-150`, `library/components/DensityToggle.tsx:26-56` — same chrome, four sites. `src/shared/ui/settings/SegmentedControl.tsx` already exists.
  - Suggested change: route all four through `<SegmentedControl options={[{value, label, Icon}]}>`. ~150 LOC saved.

### O. Visibility/access badges duplicated within marketplace

- **File**: `AccountRankingsSection.tsx:17-32` and `AccountTemplatesSection.tsx:43-72` — two `VisibilityBadge` inner-components.
  - Suggested change: shared `<MarketplaceVisibilityBadge visibility kind={'template'|'ranking'} isPublished?>`.

### P. Inline grid/mosaic helpers

- `Mosaic.tsx:135-192` — `computeGridDims` now handles density caps, cover aspect, cell aspect, and deterministic sampling. It may still overlap conceptually with `src/shared/board-ui/wrappedItemsGrid.ts`, but it is no longer the simple base-grid helper originally cited.
- `InitialsGrid.tsx:16-46` still owns a `DENSITY_CONFIG`; `Mosaic.tsx:41-49` now owns only `MAX_SLOTS` by `MosaicDensity`.
  - Suggested change: unify only if the two renderers should share density semantics. Today they intentionally diverge on gap/font/padding vs. sampled slot caps.
- `DraftRail.tsx:71-99` — inline 2×2 thumbnail grid; could fold into Mosaic with `density='thumbnail'`.

### Q. `featuredBadge` label duplication

- **File**: `CommunityConsensusSection.tsx:144-156`, `consensus/ConsensusFeaturedSpotlight.tsx:26-29`, `consensus/ConsensusRankingsRail.tsx:172-175` — repeated `RANKING_FEATURED_BADGE_LABELS[badge] ?? 'Featured'` fallback.
  - Suggested change: tiny `formatRankingBadgeLabel(badge | null): string` helper.

### R. Slice-unrelated dead code / un-imported surfaces

See T19.

### Reuse-features prior-review reconciliation

- **STILL-OPEN** (T18): `console.error` direct calls in `useExportController.ts:95, 191, 219`.
- **STILL-OPEN** (T11): subscription sprawl in `LayoutTab`, `MoreTab`, `AppearanceTab`.
- **PARTIALLY-FIXED**: `coverImageUpload.ts` adopts `brandedStringArrayIncludes` but still rolls its own canvas resize pipeline.
- **FIXED**: `MAX_IMAGE_BYTE_SIZE` consistently sourced from contracts.

---

## 3. Code Reuse — `src/shared/` + `src/app/`

> Status: ✅ complete — 315k tokens, 10m15s.

The shared layer is generally well-factored — many obvious duplicates flagged in prior reviews are now FIXED (clamp re-exported from contracts, `isPositiveFiniteNumber` re-exported, sync sidecar consolidation, button consolidation onto `Button.tsx`, sidecar factory in `localSidecar.ts`). The remaining issues fall into four buckets: (1) **two parallel pluralize/format APIs** (`shared/lib/pluralize.ts` vs `shared/catalog/formatters.ts`); (2) a handful of `shared/lib/*` helpers with **only 1 feature consumer** that should move into the feature; (3) **modest Tailwind class repetition** for the two app shells and the modal/overlay surface chrome; (4) **inline logic in `BoardPrimitives` / `ItemContent` / `boardWireMapper` / `boardJson` / `errors`** that re-implements primitives existing one directory away. ~55 actionable findings.

### 3.1. Parallel pluralize/format APIs

- **File**: `src/shared/lib/pluralize.ts:4-20` — duplicate of `pluralize` in `src/shared/catalog/formatters.ts:18-22`. Marketplace + library imports use one; workspace imports use the other. `pluralizeVerb` (lib:16) is identical to `pluralizeWord`.
  - Suggested change: collapse onto a single canonical `pluralize(n, singular, plural?)` in `shared/lib/pluralize.ts`. Delete `pluralizeVerb` (STILL-OPEN from 2026-04-18 §5.6).

- **File**: `src/shared/catalog/formatters.ts:1-50` — only 14 consumers, all marketplace/library. `formatRelativeTime` is unrelated to "catalog" and overlaps `formatAbsoluteDate` from `shared/lib/dateFormatting.ts`.
  - Suggested change: move `formatCount`, `formatRelativeTime`, `formatTimeToRank` into `shared/lib/numberFormat.ts` and `shared/lib/dateFormatting.ts`; delete the `catalog/` subdir.

### 3.2. Single-consumer "shared" utilities

See T5.

### 3.3. Inline logic that should use an existing primitive

- **File**: `src/shared/board-ui/BoardPrimitives.tsx:147-156` — `BoardLabelCellFrame` opens `style={{ backgroundColor: color, color: getTextColor(color) }}`. Same pattern in `src/shared/board-ui/ItemContent.tsx:147-150`. STILL-OPEN from 2026-04-18 §6.612.
  - Suggested change: extract `<ColoredSurface bgColor>`.

- **File**: `src/shared/board-ui/FramedItemMedia.tsx:128` & `src/shared/board-ui/ItemContent.tsx:132` — duplicate `relative h-full w-full overflow-hidden` matte container.
  - Suggested change: have `ItemContent` render `<FramedItemMedia>` w/ no `imageUrl` (or a dedicated `<MatteSurface>`).

- **File**: `src/shared/board-data/boardWireMapper.ts:45-48` — `isTierItemImageRef` shadowing `boardSnapshot.ts:111-117` (`normalizeImageRef`) and `boardJson.ts:104-105` (`isHashedRef`). Three sites checking `isRecord(v) && typeof v.hash === 'string'`.
  - Suggested change: hoist into `boardNormalizers.ts`.

- **File**: `src/shared/board-data/boardJson.ts:38-53` — `assertSupportedVersion` should live with `BOARD_DATA_VERSION` in `packages/contracts/workspace/boardEnvelope.ts`.

- **File**: `src/shared/board-data/boardSnapshot.ts:111-117` — `if (typeof hash !== 'string' || hash.length === 0) return undefined` is `isNonEmptyString(hash)`.

- **File**: `src/shared/sharing/hashShare.ts:23-34` — base64-url codec re-implements the standard alphabet swap. Prior 2026-04-16 §218 flagged this. STILL-OPEN.
  - Suggested change: move into `binaryCodec.ts` as `bytesToBase64Url`/`base64UrlToBytes`.

- **File**: `src/shared/board-ui/StaticBoard.tsx:114` — inline `break-words [overflow-wrap:anywhere]` literal duplicated in `BoardPrimitives.tsx:127` and `ItemContent.tsx:154`.
  - Suggested change: extract `WRAP_LONG_LABEL_CLASS` next to other tokens in `constants.ts`.

- **File**: `src/shared/lib/sha256.ts:1-15` & `convex/lib/sha256.ts:1-14` — two near-identical sha256 hex implementations. STILL-OPEN-ish.
  - Suggested change: hoist into `packages/contracts/lib/sha256.ts`. Backend becomes a 1-line re-export; client keeps `sha256HexFromBlob`.

### 3.4. Modal & overlay chrome duplication

See T6. Plus:

- **File**: `src/shared/overlay/ConfirmDialog.tsx:38-69` — fixed shape, no `body`/`renderActions` slot. `description: string`-only blocks any caller wanting `ReactNode`. 10 consumers. STILL-OPEN from 2026-04-18 §6.617.
  - Suggested change: accept `description: ReactNode`, optional `renderActions`, optional `tone` variant.

- **File**: `src/shared/notifications/ToastContainer.tsx:42-44` — `z-50` collides with modal `z-50`. STILL-OPEN from 2026-04-18 §6.611.
  - Suggested change: wire `Z.modal=50` and `Z.toast=60`. The `Z` ladder in `shared/theme/zIndex.ts` exists but is unused (T5).

### 3.5. App-shell Tailwind class repetition

- **File**: `WorkspaceShell.tsx:135,144`, `MyListsRoute.tsx:20,25`, `MarketplaceLayout.tsx:32` — `min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text)]` repeated 5 times.
  - Suggested change: extract `APP_SHELL_CLASS` or a `<RouteShell>` wrapper.

- **File**: `AppRouter.tsx:55-57` — `RouteFallback` carries the same shell tokens.

- **File**: `BrandCapsule.tsx:10`, `SurfaceNav.tsx:37`, `TopNavAvatarButton.tsx:28`, `TopNavAccountMenu.tsx:30` — pill chrome variants drift across 4 files.
  - Suggested change: extract `topNavCapsuleClass` const.

- **File**: `src/app/index.css:65-89,278-303,315-326` — `.board-manager-trigger`/`.board-manager-panel`/`.board-manager-flip` classes are workspace-only but live in global stylesheet.
  - Suggested change: move into a workspace-scoped CSS module; or inline the safe-area math via Tailwind arbitrary values.

### 3.6. Hooks & micro-utilities — borderline keepers

- `useImageUrl.ts` — 5 cross-feature consumers. Keep.
- `useClipboardCopy.ts` — 3 consumers. Keep in shared.
- `useInlineEdit.ts` — 5 consumers, all workspace. Borderline — could move.
- `useAbortControllerHandle.ts` — 2 consumers. Move with `useCollectAutoCropTransformsRunner` if that move happens.

### 3.7. Type guards & contract overlap

- **File**: `boardSnapshot.ts:227-242` — `BOARD_DATA_SELECTION_KEYS` array and `selectBoardDataFields` and `extractBoardData` (lines 243-259, 277-293) all spell out the same 13 fields. Adding a field requires three edits.
  - Suggested change: derive `selectBoardDataFields = (state) => Object.fromEntries(BOARD_DATA_SELECTION_KEYS.map(k => [k, state[k]]))`.

- **File**: `selectBoardDataFields:243-259` and `extractBoardData:277-293` are near-duplicate — same 13 fields, returned twice.
  - Suggested change: unify; pick a canonical name.

- **File**: `boardNormalizers.ts:32-34` — `normalizePositiveFinite` duplicates `isPositiveFiniteNumber` (`packages/contracts/lib/typeGuards.ts:5`).

- **File**: `boardNormalizers.ts:42-52` — `clampFiniteNumber` could be `Number.isFinite(value) ? clamp(value, min, max) : null` using `clamp` from contracts.

### 3.8. Misplaced or oddly-located modules

- `shared/lib/sync/` directory should move to `features/platform/sync/lib/`. STILL-OPEN from 2026-04-18 §3. Nothing in `shared/` consumes it.

- `boardSnapshotItems.ts` — naturally belongs in `shared/board-data/` rather than `shared/lib/`.

- `imageRefs.ts` — move to `shared/board-data/`. `imageTransform.ts` — move to `shared/board-ui/` (its only consumer is `FramedItemMedia.tsx`).

### 3.9. App-layer findings

- **File**: `AppRouter.tsx:55-57` — `RouteFallback` is a tiny private component. Extract `<RouteShell>` (see §3.5).

- **File**: `MyListsRoute.tsx:13-31` — duplicates the `not-yet-ready` shell branch.

- **File**: `WorkspaceShell.tsx:150-163` — inline destructive runtime-error toast UI. 13 lines of `color-mix(in_srgb,var(--t-destructive)_30%,var(--t-text))` etc.
  - Suggested change: extract `<RuntimeErrorBanner>` or render via the toast system.

- **File**: `main.tsx:18-26` — nested ErrorBoundary section names collide with `WorkspaceRoute.tsx`'s boundary.
  - Suggested change: align section names so logger scopes are unique.

### 3.10. Already-healthy observations

- `shared/ui/Button.tsx` w/ named wrappers (`PrimaryButton`, `SecondaryButton`, `ActionButton`, `ItemOverlayButton`) — clean implementation of prior "four buttons, drift" finding. **FIXED**.
- `typeGuards.ts` re-exports `isPositiveFiniteNumber` — **FIXED**.
- `math.ts` re-exports `clamp` from contracts — **FIXED**.
- `localSidecar.ts` consolidates 3 sidecars — **FIXED**.
- `sync/backoff.ts:11` is a single canonical backoff for all 7 sync scheduler call sites.
- `selection/`, `overlay/`, `routes/`, `theme/` — cohesive clusters.

---

## 4. Code Reuse — Convex backend + `packages/contracts/`

> Status: ✅ complete — 418k tokens, 8m47s.

The Convex zone has a strong reuse foundation — `convex/lib/` cleanly centralizes auth (`getCurrentUserId`/`requireCurrentUserId`), permissions (`requireBoardOwnershipByExternalId`/`requireTierPresetOwnershipByExternalId`), rate-limiting buckets, validators (with type-exact `_Assert<_Exact<...>>` drift guards), cascade-delete helpers, image validation, sha256, mediaVariants, & userUpsert retry. Auth & rate-limit duplication that the 2026-04-18 review flagged is FIXED. Remaining duplication clusters in: (a) the rankings sidecar copying template publish/clone insert skeletons (board insert + tier-rows + items + library summary) across 3 files; (b) `convex/marketplace/rankings/queries.ts` carries 4 nearly-identical 30-line `withIndex` switches for top/bottom/controversial bands; (c) the test harness — `convexTest({...})` + `rateLimiter.register()` + `seedUser()` + `asUser()` reimplemented in 5 of 8 test files; (d) `transformsEqual` (boardReconciler) duplicating `isSameItemTransform`, three `emptyXResult(cursor)` helpers, two `requireSeedAuthorized()` copies. Magnitude: medium — ~10–15 unique extractions would noticeably reduce the surface.

### 4.1. Duplicated query/mutation skeletons (cloned board insert)

- **File**: `convex/marketplace/rankings/seed.ts:981-1004` — seed sample-ranking inserts a board mirroring `remixRanking`
  - Issue: Three callsites build the same `boards` insert payload (externalId, ownerId, title, createdAt/updatedAt, deletedAt:null, revision, sourceTemplate\*, `...buildFreshBoardCloudFields`, itemAspectRatio/Mode, labels, activeItemCount/unrankedItemCount, templateProgressState via `resolveTemplateProgressState`, `EMPTY_BOARD_LIBRARY_SUMMARY`). The three (`seed.ts:981`, `mutations.ts:342-365`, `templates/mutations.ts:377-401`) differ only in `revision` (1 vs 0) and `materializationState` ('ready' vs 'clonePending').
  - Suggested change: extract `buildClonedBoardInsert(template, ownerId, title, options: { revision?, materializationState?, activeItemCount, unrankedItemCount, now })` in `convex/workspace/boards/cloudFields.ts`.

- **File**: `convex/marketplace/rankings/seed.ts:1006-1028` — board-tier inserts repeat `insertBoardTiers` shape inline.
  - Existing helper: `convex/marketplace/templates/lib.ts:1583` `insertBoardTiers`.
  - Suggested change: use `insertBoardTiers`; widen return shape to include externalIds for seed's deterministic mapping.

- **File**: `convex/marketplace/rankings/seed.ts:1080-1136` — published-ranking insert + tiers + items mirrors `publishRankingFromBoard`. ~80 lines of overlap.
  - Suggested change: extract `insertPublishedRankingWithChildren(ctx, { ownerId, template, sourceBoardId, tiers, items, ranking })` in `convex/marketplace/rankings/lib.ts`.

- **File**: `convex/marketplace/rankings/seed.ts:1036-1068` — board-items + library summary build mirrors `remixRanking:398-436`. Same loader call, same shape.
  - Suggested change: add `insertTieredBoardItems(ctx, boardId, items)` returning `BoardLibrarySummaryItem[]`.

### 4.2. Inline auth checks duplicating `convex/lib/auth.ts`

None found — every function uses `getCurrentUserId`/`requireCurrentUserId`. The 2026-04-18 review's duplicated raw `getAuthUserId` calls have been resolved.

### 4.3. Inline rate-limit calls

None — every callsite (`platform/media/uploads.ts:143`, `platform/shortLinks/{mutations.ts:35,internal.ts:30}`, `marketplace/templates/mutations.ts:443`) uses `enforceRateLimit(ctx, bucket, userId)`.

### 4.4. Inline validation that duplicates lib helpers

See T13 for plain `throw new Error` sites.

- **File**: `convex/marketplace/rankings/queries.ts:131` — `normalizeAggregateSearch` reimplements clamped-trim-or-null. `convex/marketplace/templates/lib.ts:266` `normalizeSearchQuery` does the same for templates.
  - Suggested change: promote `normalizeSearchQuery` to take a `maxLength` parameter.

- **File**: `convex/marketplace/templates/mutations.ts:97-100` — `itemTransformOrNull`/`imageFitOrNull` triviality. Inline at 2 callsites.

### 4.5. Cascade-delete patterns

All cascade-delete callsites correctly route through `convex/lib/cascadeDelete.ts:43`. Two non-routed paths:

- **File**: `convex/marketplace/rankings/aggregateInternal.ts:440-475` — `deleteTemplateRankingAggregateGeneration` does NOT use the helper. Hand-rolled paginated delete.
  - Suggested change: use `deleteCascadePageAndSchedule({ ctx, page, schedule, parentKey: 'templateId', parentId: args.templateId, phase: 'generation' })`.

- **File**: `convex/marketplace/rankings/aggregateInternal.ts:525-550` — `deleteTemplateRankingAggregateRows` same shape but ends with `deleteTemplateRankingAggregateParentRows(...)`.
  - Suggested change: widen `deleteCascadePageAndSchedule` to accept `onAllPagesDrained?: () => Promise<void>`.

- **File**: `convex/users.ts:609` — `deletePageRowsAndAdvance` is equivalent to a single-phase `deleteCascadePageAndSchedule`.
  - Suggested change: refactor users.ts cascade phases to use the helper.

### 4.6. Repeated v.object validators

- **File**: `convex/lib/validators.ts:471` `cloudBoardStateTierValidator` vs `convex/workspace/boards/upsertBoardState.ts:62` `wireTierValidator` — both validate `CloudBoardTier` shape but `wireTierValidator` is local.
  - Suggested change: promote the wire-tier shape; reuse from upsertBoardState.

- **File**: `convex/workspace/boards/upsertBoardState.ts:71-84` — `wireItemValidator` mirrors `cloudBoardStateItemValidator` (`lib/validators.ts:521`) minus a few fields.
  - Suggested change: define `cloudBoardItemBaseFields` shared spread; both validators add domain-specific fields.

- **File**: `convex/marketplace/templates/seed.ts:188-194` — `items: v.array(v.object({...}))` shape on `insertSeedTemplate`. `appendItemsToSeededTemplate.args.items` (line 1100-1107) defines the identical shape.
  - Suggested change: extract `seedStoredItemValidator` constant.

### 4.7. Sidecar/sync pattern duplication

- **File**: `convex/marketplace/rankings/aggregate.ts:29` — local `ACTIVE_JOB_STATUSES = ['queued', 'running']`. Identical literal tuple to `packages/contracts/marketplace/template.ts:41` `ACTIVE_TEMPLATE_JOB_STATUSES`.
  - Suggested change: shared `BACKGROUND_JOB_ACTIVE_STATUSES` token in contracts.

- **File**: 8 callsites do `tiers.slice().sort((a, b) => a.order - b.order)` — `lib.ts:167,183`, `mutations.ts:161`, `templates/lib.ts:774`, `templates/mutations.ts:491`, `boardStateLoader.ts:71,103`, `librarySummary.ts:54,80,82`.
  - Suggested change: `sortByOrder<T extends { order: number }>(rows)` helper in `convex/lib/`.

- **File**: `convex/marketplace/rankings/aggregate.ts:283-296` — `isTopAggregateBucket`/`isBottomAggregateBucket`/`isControversialAggregateItem` predicates use thresholds in contracts but predicates themselves are convex-only.
  - Suggested change: move predicates to `packages/contracts/marketplace/rankingAggregate.ts` so consensus UI (`src/features/marketplace/components/consensus/`) can import them.

- **File**: `convex/marketplace/rankings/seed.ts:392-411` — `requireSeedAuthorized` is a 19-line copy of `convex/marketplace/templates/seed.ts:376-395`.
  - Suggested change: extract `convex/lib/seedAuth.ts`.

### 4.8. Pagination helpers — `packages/contracts/lib/pagination.ts`

- **File**: `convex/marketplace/rankings/queries.ts:99-119` — three `emptyXResult(cursor)` helpers. Two return `{ page: [], isDone: true, continueCursor: cursor ?? '' }`. `convex/marketplace/templates/queries.ts:71` and `bookmarks.ts:36` are identical.
  - Suggested change: add `emptyPaginationResult<T>(cursor: string | null)` to `packages/contracts/lib/pagination.ts`. Replace 5 callsites.

- **File**: `convex/marketplace/rankings/queries.ts:230-513` — four `takeXAggregateItemsPage` band variants × five sort variants = ~280 lines of duplicated `withIndex` switches.
  - Suggested change: build `aggregateIndexFor(band, sort)` returning the index name, then a single dispatcher. 25-line lookup table replaces 280 lines.

- **File**: `convex/marketplace/templates/queries.ts:122-218` — `takePublicRows` enumerates 4 sort × 2 category branches; same `(category, sort) -> indexName` dispatcher would compress.

### 4.9. Aggregate maintenance helpers

- **File**: `convex/marketplace/rankings/aggregateInternal.ts:412-438` — `processTemplateRankingAggregateJob`. Single dispatch. Clean. The "load job → guard active status → load source row → fail if missing → paginate page → schedule next" lifecycle is shared with `convex/marketplace/templates/internal.ts:124-269` (publish job) but extracting `runChunkedJob<JobDoc, PageDoc, Result>` is borderline — defer until 3rd job type.

- **File**: `convex/marketplace/rankings/aggregate.ts:128-144` — `findActiveAggregateJob` for-loop over statuses. Mirrors `convex/marketplace/templates/mutations.ts:185-195,198-218`.
  - Suggested change: extract `findFirstActiveJob<TableName>(ctx, table, indexName, indexQueryFn, statuses)`.

### 4.10. Backend type aliases re-declaring contract types

None egregiously. The drift guard pattern correctly anchors backend-side helpers (e.g. `BoardLibrarySummary`) as the source of truth where the shape is convex-internal.

- **File**: `convex/marketplace/rankings/queries.ts:67-80` — `RANKING_PUBLISH_BLOCK_MESSAGES` maps `RankingPublishBlockReason` to user-facing strings. Server-only mapping is fine; if localization comes in scope, move to contracts.

### 4.11. Test helpers repeated across `tests/convex/*.test.ts`

- **File**: 3 files define identical 5-line `makeTest`. Bare `convexTest({...})` is used inconsistently (rate-limiter not registered).
  - Suggested change: add `makeConvexTest()` to `tests/convex/convexTestHelpers.ts`.

- **File**: 5 files reimplement `seedUser`. The helpers file already exports `seedPublishedTemplate`/`seedCloudBoard`/`seedPublishedRanking` but no `seedUser`.
  - Suggested change: add `seedUser` to `convexTestHelpers.ts`.

- **File**: 5 files reimplement `asUser` (`t.withIdentity({ subject: ... })`).
  - Suggested change: add `asUser`.

- **File**: `mediaVariants.test.ts:42-55` — `expectConvexCode` would be useful in 4+ other test files.
  - Suggested change: move to `convexTestHelpers.ts`.

### 4.12. Specific small wins

- **File**: `convex/workspace/sync/boardReconciler.ts:66-79` — `transformsEqual` duplicates `isSameItemTransform` (`packages/contracts/workspace/imageMath.ts:24`).
  - Suggested change: import the contract version.

- **File**: `convex/workspace/sync/boardReconciler.ts:86-103` — `colorSpecEqual` defined locally despite `TierColorSpec` being a contract type.
  - Suggested change: add `tierColorSpecEqual(a, b)` to `packages/contracts/lib/theme.ts`.

### 4.13. Reuse-backend prior-review reconciliation

- **2026-04-18 T5 (dead Convex indexes)**: STILL-OPEN — see T12. The 4 originally-listed indexes (`boardTiers.byBoardAndExternalId`, `boardItems.byBoardAndExternalId`, `boardItems.byBoardAndDeleted`, `tierPresets.byExternalId`) are now FIXED. `mediaAssets.byExternalId` is FIXED (now consumed by `findMediaAssetByExternalId`). 8 other indexes still dead (see T12).

- **2026-04-18 T7 (dead Convex repository exports)**: `requireBoardOwnership`/`requireOwnedBoard`/`requireTierPresetOwnership` raw-id variants — FIXED.

- **2026-04-18 T8 (incomplete ConvexError migration)**: STILL-OPEN — see T13.

- **2026-04-18 dead `ConvexErrorPayload` export**: FIXED — only `CONVEX_ERROR_CODES` and `ConvexErrorCode` remain.

---

## 5. Code Quality — `src/features/`

> Status: ✅ complete — 382k tokens, 9m56s.

The codebase is in good shape overall — pre-1.0 work has paid down most of the redundant-state and structural debt cited in the prior reviews. Comment hygiene is excellent, contract enums are widely adopted, and `useShallow` consolidation has propagated through nearly every UI file. The remaining issues cluster around (a) **subscription sprawl** and **stringly-typed sentinels** that survived prior passes, (b) **near-duplicate visualization/list components** in the new marketplace consensus surface, (c) **boolean-prop and parameter-sprawl** in publish/template flows, (d) lingering **module-scope mutable caches** (projection cache, popup state, drag refs), (e) several **manual title-tracking effects**, and (f) **ad-hoc fetch+toast+pending-state hooks** that are 90% identical (six "use{Action}" hooks share the same skeleton).

### 5.1. Redundant state / state that could be derived

- **File**: `marketplace/components/CommunityConsensusSection.tsx:317-323,370-390` — `searchQuery`, `band`, and `sort` remain local state. The aggregate-items query still re-keys on every toolbar change in community-average mode, but the active-ranking path now disables that query and filters locally; `filteredRows` is no longer a no-op alias.
  - Suggested change: keep the local active-ranking projection; if filters need URL persistence or debounced server re-keying, mirror `useGalleryFilters`.

- **File**: `marketplace/components/AccountTemplatesSection.tsx:175-181` — Two parallel `busySlug` and `confirmUnpublishSlug` state slots. `isUnpublished` recomputed in two places.
  - Suggested change: extract `isTemplateUnpublished(template)`; consolidate to `pendingAction: { slug; kind: 'unpublish' | 'republish' } | null`.

- **File**: 4 sites with manual `document.title` save/restore — see T3.

- **File**: `marketplace/model/useCompareRanking.ts:32` — Module-scope `projectionCache: Map<string, CompareRankingProjection>` never trimmed. See T10.
  - Suggested change: `useMemo` keyed on the same composite key, or `useRef<Map>` so cache is bounded to component instance.

- **File**: `marketplace/components/consensus/usePopover.ts:25` + `ItemPopover.tsx:49-78` — `PopoverAnchorRect` still snapshots viewport-relative coords, but `ItemPopover` now closes on document scroll. Resize and shared-layer behavior remain hand-rolled. See T11.
  - Suggested change: re-read `getBoundingClientRect()` from a stored target ref; or route through the shared anchored-popup helpers.

- **File**: `marketplace/pages/TemplatesGalleryPage.tsx:193-214` — `pendingBrowseTopRef` + `useLayoutEffect` scroll-anchor pattern. Three callsites repeat `captureBrowseAnchor()` glue.
  - Suggested change: extract `useScrollAnchor(ref, deps)`.

- **File**: `library/model/useCreateLibraryBoard.ts:21-22` and `useOpenLibraryBoard.ts:26-27` — `pendingRef.current = isPending` set in render body. Both files do this verbatim. See T1.

- **File**: `marketplace/components/PublishModal.tsx:97-114` — Parallel state `boardSelection`, `titleOverride`, `description`, `category`, `tags`, `visibility`, `creditLine`, `coverFile`, `coverError` (9 slots).
  - Suggested change: `useReducer` with a discriminated `Action`.

- **File**: `workspace/boards/dnd/useDragAndDrop.ts:76-86` — Six refs (`activeDragRef`, `lastOverIdRef`, `movedToNewContainerRef`, `initialRectRef`, `frozenOverlayRectRef`, `isMultiDragRef`, `pendingPreviewRef`, `previewFrameRef`) plus `activeDrag` state-mirror.
  - Suggested change: encapsulate in `dragSessionRef.current = {…}` or `useReducer`.

- **File**: `marketplace/components/CommunityConsensusSection.tsx:362-364` — `vizMode` defaults to `'tiers'` but `VIZ_MODES` is exported.
  - Suggested change: export `DEFAULT_VIZ_MODE = VIZ_MODES[0]`.

### 5.2. Parameter sprawl

- **File**: `CommunityConsensusSection.tsx:223-232` — `VizSwitchProps` has 7 fields. Every viz subcomponent re-receives a near-identical 5-7 prop subset.
  - Suggested change: extract `ConsensusVizContext` (frame, buckets, labelSettings, onOpenItem) above `VizSwitch`.

- **File**: `PublishModal.tsx:67-73` and `49-60` — `PublishFormProps` (4 props), `PublishModalProps` (5 props), `PublishModalEditInitialValues` (7 fields). Mode discriminator (`isEdit = !!edit`) re-derived in 4 places.
  - Suggested change: discriminated union `PublishFormMode = { kind: 'publish'; ... } | { kind: 'edit'; values: ... }`.

- **File**: `workspace/boards/ui/BoardActionBar.tsx:69-88` — 17 props (5 export-related).
  - Suggested change: group export-related props into `exportControls: ExportControls`.

- **File**: `marketplace/data/coverImageUpload.ts:38-43` — `prepareCoverVariants` mixes validation + bitmap + variants + finalize.
  - Suggested change: split `validateCoverFile`, `prepareVariants`, `uploadVariants`.

- **File**: `workspace/annotation/ui/AnnotationCanvas.tsx:8-24` — 14 props (6 event handlers, mouse + touch separated).
  - Suggested change: unify mouse/touch with pointer events; extract `useCanvasEventHandlers`.

- **File**: `workspace/annotation/ui/AnnotationToolbar.tsx:46-60` — 12 props.
  - Suggested change: pass the controller hook return shape directly: `controller: AnnotationCanvasController`.

### 5.3. Copy-paste with slight variation

See T1 (8 hooks).

- **File**: `marketplace/model/useRecordTemplateView.ts` vs `useRecordRankingView.ts` — verbatim duplicate (50 lines each). Identical implementations differ only in storage key.

- **File**: `marketplace/components/AccountTemplatesSection.tsx:183-219` — `runUnpublish` and `runRepublish` byte-for-byte identical save the mutation name + toast text. 36 lines copy-paste.

- **File**: `consensus/HeroRailCards.tsx:163-211` and `:214-267` — `divisive` and `strongest` rails share ~50 lines of identical map/render.
  - Suggested change: define `RAIL_VARIANTS = [{ key, eyebrow, badge, detail, items }, …]` array.

- **File**: `consensus/ConsensusBars.tsx`, `ConsensusHeatmap.tsx`, `ConsensusRanked.tsx`, `ConsensusTierRows.tsx`, `ConsensusScatter.tsx` — all five have a `row.label?.trim() || row.templateItemExternalId` fallback inline (7+ sites).
  - Suggested change: add `aggregateItemDisplayLabel(row)` helper to `consensus/utils.ts`.

- **File**: 3 sites compute `top = row.topBucketIndex !== null ? buckets[row.topBucketIndex] : undefined` (`ConsensusBars.tsx:43-50`, `ConsensusRanked.tsx:55-57`, `ConsensusHeatmap.tsx:86-88`).
  - Suggested change: `getTopBucket(row, buckets)` in utils.

- **File**: `AccountTemplatesSection.tsx:43-72` and `AccountRankingsSection.tsx:17-32` — `VisibilityBadge` defined inline in each.
  - Suggested change: shared `<VisibilityChip variant="ranking" | "template" />`.

- **File**: `marketplace/components/SearchInput.tsx` and `library/components/LibrarySearchInput.tsx` — same shape, different feature. See Reuse-features §H.

- **File**: `templatesRepository.ts:113-123` and `:166-173` and `:175-178` — `useMutation(api.x) as unknown as (args) => Promise<…>` cast pattern repeated 6+ times.
  - Suggested change: typed `typedMutation<TArgs, TResult>(api)` helper, OR fix the underlying typed `api` re-export.

- **File**: `library/components/LibrarySkeleton.tsx:43-47,65-67` — `gridTemplateColumns` constant duplicated three times. `BoardListTable.tsx:23-24` has a similar but distinct version.
  - Suggested change: single `BOARD_LIST_GRID_TEMPLATE` constant.

- **File**: `library/components/StatsStrip.tsx:21-35` — `StatCol` with `isFirst` boolean to suppress border-left.
  - Suggested change: drop `isFirst`; use `divide-x divide-[var(--t-border)]` on the wrapper.

### 5.4. Leaky abstractions

- **File**: `marketplace/pages/TemplatesGalleryPage.tsx:110-114` — `accessRefreshKey` reaches into `session.user._id`.
  - Suggested change: extract `getGalleryAccessRefreshKey(session)` helper.

- **File**: `marketplace/components/PublishModal.tsx:91-98` — Form imports `usePublishableBoards` directly from `~/features/workspace/boards/model/`.
  - Suggested change: add `~/features/marketplace/model/usePublishableBoards` thin re-export.

- **File**: `workspace/sharing/ui/ShareModal.tsx:54-55` — `getSnapshotRef.current = getSnapshot` ref-mirror in render body.
  - Suggested change: export stable `getActiveBoardSnapshot()` from boards/model.

- **File**: `marketplace/components/AccountTemplatesSection.tsx:158-168` — `toEditInitialValues(template)` casts a contract type into a form-state type, lives in section component.
  - Suggested change: move to `marketplace/model/templateEditDraft.ts`.

- **File**: `platform/auth/ui/AccountModal.tsx:12-13` — Imports `AccountTemplatesSection`/`AccountRankingsSection` from marketplace.
  - Suggested change: account modal slot registry — sections register themselves; AccountModal imports the slot only.

### 5.5. Stringly-typed code

See T4.

- **File**: `CommunityConsensusSection.tsx:382` — triple-ternary `railSort = railTab === 'featured' ? 'featured' : railTab === 'top' ? 'top' : 'recent'`.
  - Suggested change: `RAIL_SORT_BY_TAB: Record<ConsensusRailTab, RankingListSort>` lookup.

- **File**: `TemplatesGalleryPage.tsx:172-174` — `'+'` suffix string literal mixed inline.
  - Suggested change: `formatBoundedCount(count, atLimit, label)`.

- **File**: `library/pages/MyListsPage.tsx:215` — `deferredFilter as LibraryBoardStatus` cast (filter is wider type).

- **File**: `marketplace/components/UseTemplateButton.tsx:32-33` — `blocked = access !== 'usable'` semantics encoded as inequality.
  - Suggested change: add `isAccessBlocked` predicate to `accessMeta.ts`.

### 5.6. Unnecessary JSX nesting

- **File**: `CommunityConsensusSection.tsx:633-639` — Wrapper `<div className="grid …">` with single `<div className="min-w-0">` child.

- **File**: `Card.tsx:120-160` — Three pointer-events-none absolute overlays for badges, gradients, meta.
  - Suggested change: extract `<CardOverlay>` (gradient + badge slots) and `<CardMeta>`.

- **File**: `TemplateHero.tsx:236-261` — Repeated `<div className="px-3"><p>label</p><p>value</p></div>` 3×.
  - Suggested change: map over array.

- **File**: `library/components/BoardCard.tsx:88-93` — `<div>` wrapper exists only to set the height bucket.
  - Suggested change: pass `coverHeight` to Cover via prop.

### 5.7. Nested conditionals

- **File**: `CommunityConsensusSection.tsx:579-624` — Three states (`undefined`, `null/empty`, `computing`) each rendering a `<SectionHeader>` + state-card combination.
  - Suggested change: map state → body component.

- **File**: `TemplateHero.tsx:118-127` — Mutable `title` reassignment ladder.
  - Suggested change: lookup table by `[authStatus, saved]`.

- **File**: `TemplatesGalleryPage.tsx:154-162` — Conditional push into `browseHeadingParts` with three independent if-checks.
  - Suggested change: `[searchPart, tagPart, categoryPart].filter(Boolean)`.

- **File**: `platform/auth/ui/SignInModal.tsx:210-217` — Triple-nested ternary for button text.
  - Suggested change: lookup table.

- **File**: `consensus/ItemPopover.tsx:81-88` — Triple nested ternary on `controversyScore`.
  - Suggested change: threshold lookup `getControversyLabel(score)`.

### 5.8. Unnecessary comments

(Codebase is generally good on comments.)

- `marketplace/model/useRecordTemplateView.ts:43-44` — comment lives in both files; after dedup, only one keeps it.

The following are well-targeted "why" comments — keep them: `PublishModal.tsx:95-99`, `library/lib/sortAndFilter.ts:13`, `:33-34`.

Most file headers are within the 2-3 line cap.

### 5.9. Boolean-prop proliferation

- **File**: `Card.tsx:42-53` — `featuredLabel?` + `template.featuredRank !== null` create two parallel "is featured?" inputs.
  - Suggested change: single `featured: { kind: CardFeaturedLabel } | 'auto' | null`.

- **File**: `BoardActionBar.tsx:69-88` — `onPublishRanking: (() => void) | null` and `onPublishTemplate: (() => void) | null` are 4-way state encoded as two `null`-sentinel callbacks.
  - Suggested change: `publish?: { ranking?: () => void; template?: () => void }`.

- **File**: `library/components/LibraryEmptyState.tsx:8-14` — `filtered` boolean is really discriminated mode.
  - Suggested change: `mode: 'first-time' | 'filtered'`.

### 5.10. Effects that should be event handlers

- **File**: `marketplace/components/SearchInput.tsx:26-42` — Global `keydown` listener for ⌘K shortcut. Workspace shortcut bus (`useGlobalShortcuts`) already exists.
  - Suggested change: register through existing global shortcut bus.

- **File**: `platform/auth/ui/AccountProfileSection.tsx:55-71` — Effect reconciles `initial`/`draft` on every `user` change. Three pieces of state plus `mergeCleanProfileFields` to track touched fields.
  - Suggested change: `useReducer` with `USER_FETCHED` action.

- **File**: `TemplatesGalleryPage.tsx:203-214` — `useLayoutEffect` reads pending scroll anchor.
  - Suggested change: `requestAnimationFrame(adjustScroll)` inside the setter.

- **File**: `consensus/ItemPopover.tsx:47-64` — see T11.

### 5.11. Conditional hooks / hooks in conditionals

No violations found.

### 5.12. Hard-coded magic numbers

Most are named. Notable:

- `consensus/ConsensusHeatmap.tsx:36-37,41-43` — `share * 1.6` and `intensity > 0.45` thresholds unnamed.
- `marketplace/components/Rail.tsx:18-22` — `* 2` literal "scroll by 2 cards" magic.
- `workspace/boards/ui/TierItem.tsx:175,194` — `550`ms long-press timeout, `(dx > 8 || dy > 8)` cancel threshold, `dx > 4 || dy > 4` click-vs-drag threshold (different from long-press tolerance).
- `AccountTemplatesSection.tsx:152-156` — `h-[68px]` and `h-[72px]` skeleton row heights unnamed.

### 5.13. Stale closures / ref-based hacks

- See T1 for `pendingRef` mirror pattern in 2 library hooks.
- `workspace/sharing/ui/ShareModal.tsx:53-55` — `getSnapshotRef.current = getSnapshot` set in render body. Same pattern.
- `workspace/boards/dnd/useDragAndDrop.ts:91-95` — `setActiveDrag` writes both `activeDragRef.current` and state synchronously. Symptom of dnd-kit's synchronous callback model.
  - Suggested change: consolidate 8 refs into one session struct.

### 5.14. `any` / `unknown` casts without justification

See T4 for `<select>` cast pattern. Plus:

- **File**: `marketplace/data/templatesRepository.ts:113-200` and `rankingsRepository.ts:208-224` — `useMutation(api.x) as unknown as (args) => Promise<…>` (5+ occurrences).
  - Suggested change: typed wrapper, or fix the api package types.

- **File**: `marketplace/model/formatters.ts:11,17` — `(error as { data?: unknown }).data` and `(data as { message?: unknown }).message`.
  - Suggested change: reuse `getConvexErrorData` from `~/features/platform/sync/lib/errors.ts`.

- **File**: `marketplace/components/CoverImageInput.tsx:54` — `(SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(next.type)`.
  - Suggested change: use `brandedStringArrayIncludes`.

- **File**: `workspace/annotation/ui/AnnotationToolbar.tsx:206-211` — `Object.entries(FONT_FAMILY_LABELS) as [AnnotationFontFamily, string][]`.
  - Suggested change: typed `objectEntries` helper or iterate ordered tuple.

### 5.15. Inline complex JSX

- **File**: `CommunityConsensusSection.tsx:138-221` — `SectionHeader` is 80 lines with two 30+ line branches.
  - Suggested change: split into `<ActiveRankingHeader>` and `<AggregateHeader>`.

- **File**: `CommunityConsensusSection.tsx:438-517` — `renderBody` function-as-value with 80 lines.
  - Suggested change: extract `<ConsensusBody />` proper component.

- **File**: `PublishModal.tsx:197-407` — `PublishForm` body is 210 lines.
  - Suggested change: extract `<TemplateDetailsFields>`, `<TemplateCoverFields>`.

- **File**: `MyListsPage.tsx:138-291` — Page render is 150 lines, with inline 35-line ternary chain.
  - Suggested change: extract `<MyListsResults>`.

- **File**: `Card.tsx:114-231` — Card body is 117 lines with several inline absolute-positioned overlays.

- **File**: `TemplateHero.tsx:170-353` — TemplateHero is 184 lines mixing hero cover, meta, action cluster, tag list.

- **File**: `BoardActionBar.tsx:215-484` — 270-line render with two giant nested menus.
  - Suggested change: extract `<DropdownMenu>` primitive.

- **File**: `TemplatesGalleryPage.tsx:242-468` — Gallery page render is 220 lines with 7 sections inline.

### 5.16. Bare try/catch with console.error

- **File**: `useExportController.ts:95, 191, 219` — see Reuse-features §L.
- **File**: 4 places use raw `error.message` instead of `formatError`. See Reuse-features §L.

### 5.17. Premature abstractions / single-use factories

- **File**: `marketplace/components/loadPublishModal.ts` — 13-line module. Pattern repeats for every modal.
  - Suggested change: generic `createLazyModalLoader<T>(import)`.

- **File**: `marketplace/model/useTemplateDetail.ts`, `useRankingDetail.ts`, `useRankingPublishAvailability.ts` — see T19.

- **File**: `marketplace/components/consensus/useHeroSpread.ts` — 39 lines, called by one consumer, trivial mapping.
  - Suggested change: inline `useMemo` at the call site.

### 5.18. Other cross-cutting

- **File**: `marketplace/data/rankingsRepository.ts:144-158` — `args = enabled && … ? { templateSlug, generation, ...(sort ? { sort } : {}), …}` — spread-undefined-or-empty pattern.
  - Suggested change: `compactArgs({ templateSlug, generation, sort, band, search })` helper.

- **File**: `platform/preferences/model/usePreferencesStore.ts:104-115` — `createPreferenceSetter` factory creates 20+ near-identical setter closures. Each is `(value) => { if (get()[key] === value) return; set({ [key]: value }) }`.
  - Suggested change: single `setPreference: <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => void` action.

- **File**: `marketplace/components/Card.tsx:179-182`, `RankingDetailPage.tsx:355-359`, `TemplateHero.tsx:180-183` — three inline `displayName.replace(/^@/, '').slice(0, 1).toUpperCase()`. See T3.

- **File**: `useRecordTemplateView.ts:10` and `useRecordRankingView.ts:10` — `'tlb:tpl-view'` / `'tlb:rank-view'` magic strings.
  - Suggested change: consolidate session-storage keys in `~/shared/storage/sessionKeys.ts`.

- **File**: `workspace/annotation/model/useAnnotationCanvas.ts:118-127` — `useState` calls × 6 for related editor state. Hook returns 19 fields.
  - Suggested change: `useReducer<AnnotationState, AnnotationAction>`; group return into `{ tool, brush, text, history, handlers, actions }`.

### Quality-features prior-review reconciliation

- **T11 (subscription sprawl)**: Mostly FIXED in features.
- **T4 (`BoardId | ''` sentinel)**: FIXED.
- **T9 (per-slice cloud-sync duplication)**: STILL-OPEN. See T7.
- **T18 (logger / observability)**: `logger` widely consumed; abstraction in place.
- **New** (post-2026-04-18): marketplace consensus folder is a fresh source of duplication.

---

## 6. Code Quality — `src/shared/` + `src/app/`

> Status: ✅ complete — 259k tokens, 8m55s.

The codebase is **markedly cleaner than the 2026-04-18 baseline** — the 542-line `useCloudSync` god hook has been decomposed (now 57 lines at `src/features/platform/sync/orchestration/useCloudSync.ts`), and the `BoardId | ''` sentinel has been replaced by `BoardId | null` in the call sites visible from `src/app/`. Remaining issues are mostly **medium/low** severity: stringly-typed branches, parameter sprawl in `BaseModal`/`anchoredPopup`, copy-paste in `UploadDropzone` variants, magic numbers across `overlay/uiMeasurements.ts`, effects with object-literal deps, three `as` casts in `urlFilters.ts` and `boardJson.ts`, an unbounded module-level event-listener registration in `imageBlobCache.ts`, and a sprinkling of unnecessary forwardRef/memo on components that don't benefit. Nothing in this zone rises to the bar of "blocking work".

### 6.1. Redundant state / derived state cached as state

- **File**: `src/shared/ui/NumberStepper.tsx:43-44` — `draft` shadows `value` while idle. Borderline.

- **File**: `src/shared/lib/useCollectAutoCropTransformsRunner.ts:40` — `progress` mirrors hook-internal state. `running` is fully derivable from "abort controller current".
  - Suggested change: derive `running`.

- **File**: `src/app/bootstrap/useAppBootstrap.ts:52` — module-level promise singleton. Stateful escape hatch but bounded.

### 6.2. Parameter sprawl

- **File**: `BaseModal.tsx:18-38` — `BaseModalProps` has 16 props (6 booleans).
  - Suggested change: group `dismissal: { escape?, backdrop?, propagation? }` and `classes`.

- **File**: `dismissibleLayer.ts:12-23` — 9-prop options object.
  - Suggested change: split `useDismissibleLayer` (close behavior) + `useAnchoredReposition` (scroll/resize wiring).

- **File**: `debouncedSyncRunner.ts:34-83` — 18-field options object.
  - Suggested change: extract `flushPolicy`, `retryPolicy`, `dedupPolicy`.

- **File**: `BoardPrimitives.tsx:107-117` — `BoardLabelCellFrameProps` carries 8 fields, 6 style-related.
  - Suggested change: accept a single `appearance: Pick<StaticBoardAppearance, …>` prop.

- **File**: `Button.tsx:24-36` — `ButtonProps` exposes 5 enum-style variant axes; only certain combinations are valid.
  - Suggested change: discriminated-union variants.

### 6.3. Copy-paste with slight variation

- **File**: `UploadDropzone.tsx:33-99` — full JSX duplicated for `'panel'` vs `'empty'` variants.

- **File**: `boardSnapshot.ts:243-259, 277-293` — `selectBoardDataFields` and `extractBoardData` build the identical 13-field object.

- **File**: `boardSnapshot.ts:97-118, 100-118` (`normalizeBoardLabelSettings` vs `normalizeItemLabelOptions`) — near-identical normalizers.

- **File**: `labelDisplay.ts:68-102, 106-131` — `resolveLabelDisplay` and `resolveLabelLayout` 90% duplicated.
  - Suggested change: have `resolveLabelDisplay` call `resolveLabelLayout` and slap text on top.

- **File**: `pluralize.ts:4-20` and `catalog/formatters.ts:18-22` — see Reuse-shared §3.1.

- **File**: `TextInput.tsx:18-29` and `TextArea.tsx:16-27` — identical SIZE_CLASS / VARIANT_CLASS maps.

- **File**: `boardJson.ts:128-194, 209-258` — `parseBoardData` nested loops duplicated within `parseBoardsJson`.

### 6.4. Leaky abstractions

- `labelBlocksStyle.ts:46-54` — shared `board-ui` imports `~/shared/theme/textStyles`. One-way and within shared, but coupling is horizontal.
- `TabbedSettingsModal.tsx:6-9` — `TabbedSettingsModal` doubles as a domain hint; rename to `TabbedDialog`.
- `AppTopNav.tsx:6` — top-nav shell imports `useSignInPromptStore` directly. Verified: nothing under `src/shared/` imports `~/features/`.

### 6.5. Stringly-typed code

- **File**: `labelBlocksStyle.ts:12-22` — `LABEL_SCRIM_CLASS` keyed by string literal `'none'|'dark'|'light'`. Typed via `as const` but never asserted against the `LabelScrim` contract type.
  - Suggested change: `as const satisfies Record<LabelScrim, string>`.

- **File**: `labelBlocksStyle.ts:27-37` — `LABEL_TEXT_COLOR_HEX` asserted; resulting `LABEL_TEXT_COLOR_STYLE` recovered via `as`.

- **File**: `aspectRatio.ts:32-36` — `RatioOption.kind` is its own ad-hoc enum, doesn't match `ItemAspectRatioMode` from contracts.
  - Suggested change: align to contract enum.

### 6.6. Unnecessary JSX nesting

Mostly fine. The handful flagged are conventional centering wrappers. Nothing actionable.

### 6.7. Nested conditionals

- `ItemContent.tsx:93-141` — branch tree 3 deep with duplicated body across two outer branches.
  - Suggested change: hoist `placementMode`/`isCaptioned` to top, render once.

### 6.8. Unnecessary comments

Many one-line "WHAT" comments to delete (each minor):

- `App.tsx:2`, `main.tsx:14`
- `binaryCodec.ts:9, 41, 65, 79`
- `sha256.ts:4, 17`
- `className.ts:2`
- `boardSnapshot.ts:212`
- `board-ui/constants.ts:44, 51, 58, 64, 73`
- `images/imageStore.ts:8-11, 22-31`
- `typeGuards.ts:14, 17, 20, 25`
- `pluralize.ts:1-21`

### 6.9. Boolean-prop proliferation

- `BaseModal.tsx:18-38` — 6 booleans (see §6.2).
- `dismissibleLayer.ts:12-23` — 4 booleans.
- `UploadDropzone.tsx:5-14` — `isDraggingFiles`, `isProcessing`, `showHint`. `isDraggingFiles` and `isProcessing` are mutually exclusive.
  - Suggested change: collapse to `state: 'idle' | 'dragging' | 'processing'`.

### 6.10. Hooks that should be plain functions

None misclassified.

### 6.11. Magic numbers

Most named.

- `overlay/uiMeasurements.ts:1-12` — `SETTINGS_MENU_HEIGHT_PX = 230` is a hardcoded estimate.
  - Suggested change: measure after mount.

- `labelBlocksStyle.ts:67-70, 81-84` — magic ratios (0.35, 0.12, 0.4, 0.15) without naming.

### 6.12. God hooks

- `usePointInTimeQuery.ts:21-83` — borderline. Each concern justified; surface area is subtle.
- `debouncedSyncRunner.ts:113-417` — non-hook factory, 18-field options. Acceptable; covered by tests.
- `useCloudSync.ts` — **FIXED** (542 → 57 lines).

### 6.13. Sprawling Zustand stores

- `useToastStore.ts` — 3 fields, 2 actions. Tight.

### 6.14. CSS-in-JS hacks in JSX style props

Mostly justified arbitrary values. Notable:

- `Toggle.tsx:33-37` — `translate-x-[18px]`/`translate-x-[22px]` hand-coordinated with `w-9`/`max-sm:w-11` track sizing. Encode the relationship.

### 6.15. Imperative DOM manipulation

- `theme/runtime.ts:11-69` — direct `document.documentElement.style` mutation. Justified for runtime theming.
- `overlay/modalLayer.ts:20-47` — full-app inert. Justified.
- `overlay/menuOverflow.ts:50-68` — `applyMenuOverflowFlip` adds Tailwind class tokens via `node.classList.add`. Bypasses React. On resize the classes never come off.
  - Suggested change: thread flip decision through state, or register resize handler.

### 6.16. Effects with unstable deps

See T9.

- `dismissibleLayer.ts:158-169` — see T9.
- `urlFilters.ts:117-124` — `create` from caller. If caller doesn't memoize, canonicalize-on-mount runs every render.
  - Suggested change: document that `create`/`parse` MUST be referentially stable.
- `urlFilters.ts:155-168` — `useFilterSetters` accepts `optionsByKey` as fresh literal every caller invocation.

### 6.17. `as` casts that mask real type problems

- `typeGuards.ts:24, 30` — `(arr as readonly string[]).includes(value)`. Documented intent.
- `urlFilters.ts:160-165` — `const setters = {} as FilterSetters<TFilters>` build-up pattern; `commitFilters({ [key]: next } as Partial<TFilters>, options)` bypasses key narrowing.
- `urlFilters.ts:12` — `values.includes(value as T)`.
- `boardJson.ts:133` — `const data = raw as Partial<BoardSnapshotWire>` — every subsequent access guarded.
- `boardSnapshot.ts:325` — `tier as RawTier` — subsequent `normalizeTier` validates.
- `labelBlocksStyle.ts:39-44, 46-54` — `as Record<LabelTextColor, …>` after `Object.fromEntries`.
- `lib/imagePersistence.ts:64-66` — `bytes as unknown as BufferSource` double casts.

### 6.18. Inline event-listener registration without cleanup

- `imageBlobCache.ts:363-367` — module-level `window.addEventListener('pagehide', …)` and `'online'`. Never removed. Production fine; dev HMR builds up. See T10.

### 6.19. Unnecessary forwardRef / memoization

- `PrimaryButton.tsx:14`, `ColorInput.tsx:23`, `ActionButton.tsx:32`, `ItemOverlayButton.tsx:15` — `forwardRef` over `Button` (which already forwards). React 19 forwards refs through props.
  - Suggested change: drop explicit `forwardRef` wrappers.

- `StaticBoard.tsx:71` — `memo(StaticBoard)`. Verify via React DevTools profiler.

### 6.20. Test-only exports leaking into prod bundle

- `lib/autoCrop.ts:188-199` — `detectContentBBoxFromImageData` exported with comment `// exposed for unit tests…`.
  - Suggested change: move to a `__tests__/`-co-located internals file.

### Quality-shared other notable observations

- `bootstrap/useAppBootstrap.ts:75-120` — bootstrap promise + onFinishHydration listener pair correct but subtle.
- `WorkspaceShell.tsx:122-129` — `handlePublishRanking` conditionally null. Inline ternary suggests dedicated `useRankingPublishGate()` selector hook.
- `StaticBoard.tsx:82-92` — per-board override pattern implicit. Hoist into `resolveBoardAppearance(data, appearance)`.
- `menuOverflow.ts:71-93` — `useMenuOverflowFlipRefs` reads `window.innerWidth` directly inside ref callback; viewport changes don't re-flip.
- `imageRefs.ts:29-33` — `PRIORITY_ORDER` exposed publicly but internal API is the meaningful one.
- `boardSnapshot.ts:227-241` and `:243-259, 277-293` — three nearly-identical 13-field declarations.

### Quality-shared prior-review reconciliation

| Prior finding                    | Status                        |
| -------------------------------- | ----------------------------- |
| `useCloudSync` 542-line god hook | **FIXED** — now 57 lines      |
| `BoardId \| ''` sentinel         | **FIXED** — `BoardId \| null` |

---

## 7. Code Quality — Convex backend + `packages/contracts/` ⚠️ PARTIAL

> Status: ⚠️ PARTIAL — limit cutoff at 361k tokens / 11m08s. The agent wrote a closing summary when it sensed the limit; coverage is not exhaustive in seed scripts, schema retention crons, and action-vs-mutation hygiene.

The Convex backend is in solid shape overall — the team has clearly invested in the basics (every public function has `args` + `returns`, all errors flow through `ConvexError` with codes from `packages/contracts/platform/errors.ts`, no `as any` casts, no `.collect()` in production paths, dense `_Assert<_Exact<…>>` drift guards on every contract↔validator pair). The previous 2026-04-18 dead-index/incomplete-ConvexError concerns are largely resolved, but a fresh round of dead surface area has accumulated alongside the ranking-aggregate work.

### 7.1. Missing `returns:` validators

No findings. Every public/internal function has `returns:`. The 2026-04-18 gap is closed.

### 7.2. Plain `throw new Error` instead of `ConvexError`

See T13. Plus:

- **File**: `convex/auth.config.ts:10` — top-level import-time bootstrap. Acceptable as the one plain-throw site (no `ctx`).

- **File**: `tests/convex/convexTestHelpers.ts:88` — `throw new Error('template author missing')` in test helper. Harmless.

- Scripts (`scripts/marketplace-seed/templateActions.ts:47`, `scripts/lib/autoCropDetect.ts:37`, `scripts/drag-audit.mjs`, `scripts/screenshots.mjs:59`) — plain Error acceptable; scripts run outside Convex.

### 7.3. Missing argument validators

No findings. Every public/internal function uses `args: { … }` with `v.…` validators.

### 7.4. Functions exposing internal `Doc` shapes to clients

No findings on the public surface. Public queries/mutations return projected wire shapes pinned to contracts via `_Exact` asserts.

Minor: `convex/marketplace/templates/queries.ts:80-92` — `toBaseJobProgress` casts `jobId: job._id`; the `_id` flows out as `string` through `marketplaceTemplateJobProgressFields.jobId: v.string()`, losing the `Id<"templatePublishJobs">` brand at the boundary intentionally.

### 7.5. Missing index usage / `.filter()` over `.withIndex()`

- **File**: `convex/marketplace/rankings/mutations.ts:136` — `buildOrderedRankingItems` does `items.filter((item) => item.deletedAt === null)` after `loadBoundedBoardRows`.
  - Suggested change: a deletion-aware loader using `byBoardDeletedAtOrder`.

- **File**: `convex/marketplace/templates/mutations.ts:490` — same pattern in `publishFromBoard`.

- **File**: `convex/marketplace/rankings/aggregateInternal.ts:316-356` — `selectNextRanking` paginates `bySourceTemplatePublicCreatedAt` with `numItems: 1`. Documented design for cursor-resumability. Acceptable.

- **File**: `convex/marketplace/templates/queries.ts:262-278` — `searchPublicRows` over-fetches and JS-filters by tag. Documented; acceptable.

- **File**: `convex/marketplace/templates/queries.ts:597` — `getRelatedTemplates` `.filter((row) => row.slug !== args.slug)` — query takes `limit + 1` to compensate. Acceptable.

### 7.6. Dead exports / dead indexes

See T12 (8 dead schema indexes) and T19 (4 dead public functions, 5 dev-only seed actions, 3 frontend façades).

### 7.7. Stringly-typed code

- **File**: `convex/marketplace/rankings/seed.ts:53-56` — `type TargetKey = 'ssbu' | 'zelda' | 'mcu'` duplicated alongside `targetKeyValidator`.
  - Suggested change: `const SEED_TARGET_KEYS = ['ssbu', 'zelda', 'mcu'] as const`; derive type and validator.

- **File**: `convex/marketplace/rankings/aggregateInternal.ts:29` — `ACTIVE_JOB_STATUSES = ['queued', 'running'] as const` parallel to `templateRankingAggregateJobStatusValidator`.
  - Suggested change: export shared tuple.

- **File**: `convex/marketplace/rankings/aggregate.ts:33` — `'templateOrder' satisfies TemplateRankingAggregateItemSort`. Use `TEMPLATE_RANKING_AGGREGATE_ITEM_SORTS[0]`.

- **File**: `convex/marketplace/templates/internal.ts:56,76` — `errorCode: string` parameters; every call site passes `CONVEX_ERROR_CODES.*`.
  - Suggested change: tighten to `errorCode: ConvexErrorCode`.

### 7.8. Inline ID-prefix string checks

See T20.

### 7.9. Repeated rate-limit boilerplate

`enforceRateLimit` already wraps. No major findings.

### 7.10. Repeated auth-check + ownership-fetch boilerplate

The pattern is well-factored (`requireCurrentUserId`, `requireBoardOwnershipByExternalId`, etc.).

- `convex/marketplace/rankings/queries.ts:550-593` — `getMyRankingForTemplate` replicates `getCurrentUserId` + slug guard + `findTemplateBySlug` locally. Hard to factor without a generic over result shape. Acceptable.

### 7.11. Mutations doing too much

- `convex/marketplace/rankings/mutations.ts:189-298` — `publishRankingFromBoard` (110 lines). Transaction-bounded by `assertRankingFitsSingleTransaction`. Acceptable.

- `convex/marketplace/rankings/mutations.ts:300-458` — `remixRanking` similarly large, transaction-bounded. Acceptable.

- `convex/marketplace/templates/mutations.ts:594-726` — `updateMyTemplateMeta` (130 lines) orchestrating template patch + counter delta + tag-row sync + source-board live-template flip.
  - Suggested change: leave; document the state-machine cases in a top comment.

- `convex/users.ts:356-371` — `cascadeDeleteUserData` dispatches over `CASCADE_PHASE_HANDLERS`. Clean.

### 7.12. Missing ConvexError codes

Coverage is complete in `CONVEX_ERROR_CODES`. Once §7.2/T13 sites are migrated, pick `payloadTooLarge` (dimensions out of range) and `invalidInput` (malformed payload). No new codes needed.

### 7.13. Inconsistent timestamp handling

All write paths use `Date.now()` directly. Convex doesn't expose a frozen `now`; `Date.now()` per-call is the standard pattern.

- **File**: `convex/marketplace/templates/internal.ts:629-660` — `recomputeTemplateTrendingScores` accepts `now: v.optional(v.number())` but never passed. Dead arg.
  - Suggested change: drop the `now` arg; OR thread through from the cron entry so all batches share one timestamp.

### 7.14. Cron jobs

See T21 for trending recompute. Plus:

- `convex/crons.ts:97-103` — aggregate scheduler fan-out.
- `convex/crons.ts:53-58` — daily hard-delete cron. Standard Convex pattern.

No `crons.hourly`/`daily`/`weekly` helpers used — all `cron`/`interval`. Compliant with guidelines.

### 7.15. Schema issues

#### Optional columns the code path never produces

- `convex/schema.ts:88-126` — `boards.revision: v.optional(v.number())` — every path sets concrete value; `?? 0` fallbacks are migration shims.
  - Suggested change: pre-1.0, tighten to `v.number()`.

- `convex/schema.ts:307-310` — `templateCards.weeklyUseCount`/`weeklyViewCount`/`trendingScore`/`trendingComputedAt` — every fresh insert writes concrete values.

#### Required columns that should be optional

- `convex/schema.ts:559-572` — `templateRankingAggregates.bucketSpread: v.optional(v.array(v.number()))` — verify if any insert leaves it absent.

#### Indexes that could be denser

- `publishedRankings` has 7 indexes sharing `(sourceTemplateId, isPubliclyListable, …)` prefix. All 7 are referenced; storage cost grows linearly.
- `templateRankingAggregateItems` has 20+ indexes. See T15.

#### `templateRankingAggregateJobStatusValidator` underspecified

- `convex/lib/validators.ts:220-223` — only `'queued'`, `'running'`. Future "failed" state cannot be persisted without schema change. Job-failure path absent (poison-pill protection missing — see §7.18).
  - Suggested change: extend to `['queued', 'running', 'failed']` ahead of poison-pill detection.

### 7.16. Validators in `packages/contracts/`

- `pagination.ts:1-12` — single `PaginationResult<T>` interface. Replaces per-feature pagination shape duplication.
- `convex/lib/validators.ts:303-389` — bidirectional `_Exact<A, B>` drift guards. 60+ asserts. Excellent.
- `ranking.ts:186-216` — `buildRankingBucketPlacements` lives in contracts (used by both backend and frontend). Good placement.
- `rankingAggregate.ts:48-49` — `makeEmptyBucketSpread` also a contract helper. Fine.
- `lib/ids.ts:43-45` — `isTierId` present but un-used in `upsertBoardState.ts:192` (T20).

### 7.17. Convoluted test setups

- `tests/convex/marketplaceTemplates.test.ts:72-93` — `withLargeTemplateJobsEnabled` env-var mutation. Vitest concurrency could leak.
  - Suggested change: `vi.stubEnv('LARGE_TEMPLATE_FEATURE_STATE', 'public')` + automatic teardown.

- `tests/convex/marketplaceTemplates.test.ts:38-43` — enabling `transactionLimits` is the right choice.

### 7.18. Aggregate scheduler resilience (additional finding)

- `convex/marketplace/rankings/aggregateInternal.ts:411-438` — any thrown error from `incrementAggregateItem` etc. bubbles out, scheduler retries the whole job invocation. No `failed` status, no retry counter on the job row. A poisoned page could loop forever.
  - Suggested change: add `retryCount: number` + `lastError: string | null` to `templateRankingAggregateJobs` schema; on N consecutive failures, mark `'failed'` and skip. Pair with `byStatusAndUpdatedAt` index (T12).

### 7.19. Other notable observations

- `convex/marketplace/rankings/queries.ts:182-228` — `takeSearchAggregateItemsPage` materializes the full result set on every page request. Bounded by `MAX_SYNC_ITEMS = 5000`. Acceptable.

- `convex/marketplace/templates/lib.ts:683-711` — `incrementTemplateUseStats` patches both `templateStats` and `templateCards`. `templateCards.useCount` mirror exists for sort indexes. Acceptable; document.

- `convex/marketplace/rankings/mutations.ts:489-521` — `markRankingFeaturedImpl` & `unmarkRankingFeaturedImpl` only invoked from `seed.ts:1257`. `Impl` suffix suggests an action wrapper was planned. Document dashboard-only invocation.

- `convex/lib/templateProgress.ts` and the `templates.templateProgressState` enum — `templateProgressState` on `boards` is a denormalized state recomputed on every board write. Single source of truth; worth noting.

### 7.20. `.collect()` and `for await` paths

See T18.

### 7.21. Magic numbers

- `convex/marketplace/rankings/lib.ts:33-34` — `MAX_SLUG_ATTEMPTS = 8` duplicates `templates/lib.ts:112`. `MAX_RANKING_TIER_ROWS = 64` may duplicate `MAX_SYNC_TIERS`.
  - Suggested change: hoist to `convex/lib/limits.ts`.

- Several other file-local limits that should live in `lib/limits.ts`: `templates/queries.ts:62-63` (FEATURED_LIMIT, RAIL_LIMIT), `templates/queries.ts:223-224` (SEARCH_AND_TAG_OVERFETCH, TAG_INTERSECT_ID_CAP), `templates/queries.ts:560-561` (DEFAULT_RELATED_LIMIT, MAX_RELATED_LIMIT), `lib/imageValidation.ts:83`, `platform/media/queries.ts:18,48,52`, `workspace/boards/queries.ts:29-31`, `workspace/tierPresets/queries.ts:12`.

### 7.22. `as any` / unsafe casts

None found in `convex/`, `packages/contracts/`, `tests/convex/`. Two `as string` casts in `convex/marketplace/templates/queries.ts:258,275` to bridge `Id<'templates'>` to `string` for `Set<string>`. Annotated. Acceptable.

> **PARTIAL coverage note**: this report ended here on a synthesis section. The following zones were likely under-explored before the cutoff: detailed seed-script audit (only headlines covered), schema retention crons, action vs mutation hygiene across `convex/platform/`, and the `tierPresets` and `platform/preferences` mutation surfaces.

---

## 8. Efficiency — `src/features/` ⚠️ PARTIAL

> Status: ⚠️ PARTIAL — limit cutoff at 413k tokens / 10m12s. The agent prioritized the workspace dnd / TierItem hot path and marketplace consensus subscriptions; under-explored zones include `workspace/imageEditor`, `workspace/annotation`, the `library/` slice, and the `workspace/preview/` slice.

The hot-path issues live in `workspace/boards/ui/TierItem.tsx` and `workspace/boards/ui/TierRow.tsx`, which are the per-tile/per-row components rendered hundreds of times on a populated board. TierItem subscribes to a 5-field useShallow that includes the board-wide `selectKeyboardTabStopItemId` derivation — every keyboard focus change forces every tile through useShallow comparison and an internal getFallbackTabStop walk. UnrankedPool's `selectActiveItemCount` selector reads `state.items` (the full item map), then uses Object.keys per render. On the marketplace side, `useCompareRanking` ships an unbounded `projectionCache`, `usePublishableBoards` ships an unbounded `entryCache`, and `crossTabSyncLock` ships an unbounded `lastAcquiredByPeer` — three unbounded caches.

### 8.1. Unnecessary work / re-renders / fan-out

See T8.

- **File**: `workspace/boards/ui/TierItem.tsx:55-92`, `:67`, `workspace/boards/ui/UnrankedPool.tsx:94`, `workspace/boards/model/slices/boardDataSlice.ts:18-30` — see T8.

- **UPDATED 2026-05-07**: prior `Mosaic.tsx:95-99` `tiles = items.slice(...)` memo-bust finding is obsolete. `Mosaic.tsx` now memoizes `displayItems` and uses deterministic sampling before slicing to the computed slot count.

- **File**: `marketplace/components/consensus/ConsensusTierRows.tsx:157-166` — `resolveYourBucket` recreated each render. `groupRowsByModalBucket` allocates fresh `groups` array including fresh `items: []` arrays per `rows`/`buckets` change.

- **File**: `marketplace/components/consensus/activeRankingRows.ts:21-84` — active-ranking row projection moved out of `CommunityConsensusSection`, but still allocates a fresh distribution array per item. For 100 items × 6 buckets, 600+ cell objects per active-ranking switch.
  - Suggested change: cache immutable empty distributions by bucket count, and copy only the active bucket cell when needed.

- **File**: `library/pages/MyListsPage.tsx:62-71` — `foldedTitleByExternalId` walks every row to fold titles. Memo correctly keyed on rows identity. Acceptable for 200 boards.

- **File**: `workspace/boards/ui/BulkActionBar.tsx:18-36` — Subscribes to `state.tiers` reference. Acceptable.

### 8.2. N+1 / per-item subscriptions / repeated derivations

See T8.

- **File**: `workspace/boards/ui/TierRow.tsx:93-98` — `getBoardItemAspectRatio(state)` per row plus `defaultItemImageFit` per row.

- **File**: `workspace/boards/ui/UnrankedPool.tsx:95-100` — duplicated `getBoardItemAspectRatio` + `defaultItemImageFit` selector.

- **File**: `marketplace/components/consensus/HeroRailCards.tsx:131-145` — Two parallel paginated queries for the same template aggregate. CommunityConsensusSection later subscribes a third. Three+ subscriptions concurrently from different components.
  - Suggested change: server-side "topN per band" endpoint, or lazy-load rail cards behind IntersectionObserver.

- **File**: `workspace/boards/ui/DragOverlayItem.tsx:67-74` — DragOverlayItem subscribes 3 separate times (boardAspectRatio, boardDefaultFit, boardLabels) plus `useShallow` preferences projection.
  - Suggested change: combine into one `useShallow`.

### 8.3. Missed concurrency

- `platform/sync/orchestration/firstLoginSyncLifecycle.ts:36-83` — board merge serialized before preferences/preset merges. Intentional.
- `marketplace/components/CommunityConsensusSection.tsx:367-400` — Convex/React already opens queries in parallel per render pass. Not an issue.

### 8.4. Hot-path bloat

- **File**: `workspace/boards/dnd/useDragAndDrop.ts:117-119` — `getCurrentDragPreview` calls `getEffectiveContainerSnapshot` on every drag move when no pending preview. `createContainerSnapshot` deep-copies tiers and unrankedItemIds.
  - Impact: medium-high (fires at pointer-move frequency).
  - Suggested change: snapshot once at drag start; mutate forward via `resolveNextDragPreview`.

- **File**: `workspace/boards/dnd/dragSnapshot.ts:65-73` — `createContainerSnapshot` deep-copies item id arrays per tier. Every drag start (and fallback) calls this.
  - Suggested change: drop the spreads, share array references with the store.

- **File**: `workspace/boards/dnd/dragCollision.ts:25-135` — Collision detection runs `useActiveBoardStore.getState()` and `getEffectiveContainerSnapshot` on every collision tick.
  - Suggested change: pass a stable snapshot via the activeDragRef.

- **File**: `workspace/imageEditor/ui/ImageEditorPane.tsx:413-442` — Wheel handler attached natively; re-subscribes when `getFitBaselineZoom`/`setWorkingDraft` change.
  - Suggested change: stash callbacks in refs.

- **File**: `workspace/boards/ui/TierRow.tsx:230-248` — ResizeObserver re-installed when `showCustomColorPicker` flips.

- **File**: `workspace/imageEditor/ui/ImageEditorPane.tsx:373-411` — `keydown` handler re-subscribes on `[url, canvasW, canvasH, setWorkingDraft]`. `canvasW`/`canvasH` change frequently during pane mount.

### 8.5. Recurring no-op updates

- **File**: `workspace/boards/dnd/useDragAndDrop.ts:141-149` — `useEffect` schedules and immediately cancels rAF that resets a ref. With pointer-move firing 60Hz, scheduler runs 60× per second during a drag.
  - Suggested change: reset ref directly inside move handler.

- **File**: `workspace/imageEditor/lib/useMeasuredElementSize.ts:32-45` — `update()` called on every ResizeObserver tick with no debouncing. Bails when size unchanged.

### 8.6. Wrapper `set()` reducers honor same-reference returns

Well-handled across slices. `setOnline`, `setBoardStatus`, `setActiveItemId`, `setKeyboardMode`, `clearKeyboardMode`, `cancelKeyboardDrag`, `clearSelection`, `selectAll`, `toggleItemSelected`, `setExportItemsPerRow`, and `createPreferenceSetter` all bail to `state` on no-change. Good.

- `dragPreviewSlice.ts:79-89` — `updateDragPreview` checks `state.dragPreview === preview` (object-identity). Consumers always pass fresh snapshot. Upstream-gated by `resolveNextDragPreview`. Acceptable.

### 8.7. Unnecessary existence checks (TOCTOU)

No flagrant TOCTOU patterns found.

### 8.8. Memory leaks

See T10.

### 8.9. Unbounded data structures

See T10. Plus:

- `marketplace/model/useRecordTemplateView.ts:11` and `useRecordRankingView.ts:10` — sessionStorage keys grow per-slug. Bounded by sessionStorage cap (~5MB).
  - Suggested change: trim to last N (e.g. 500) slugs.

### 8.10. Overly broad operations

- **File**: `workspace/boards/model/slices/helpers.ts:47-55` — `getAllBoardItemIds` runs `tiers.flatMap + spread of unrankedItemIds` on every selection event.

- **File**: `workspace/imageEditor/model/useImageEditorAutoCropAll.ts:96-128` — `getManualAdjustmentCount` iterates filteredItems and calls `areCachedAutoCropsApplied([it], ...)` per item.
  - Suggested change: compute counts once per filter change in `useMemo`, or change `areCachedAutoCropsApplied` to take a single item.

- **File**: `workspace/imageEditor/ui/ImageEditorModal.tsx:64-92` — Subscribes to entire `s.items`, `s.tiers`, `s.unrankedItemIds`, plus 6 actions. Pulling stable function refs into `useShallow` forces 9-field comparison every store update.
  - Suggested change: pull actions from a separate selector.

### 8.11. Heavy synchronous work in `useMemo`

- **File**: `marketplace/components/consensus/activeRankingRows.ts:21-84` — `buildRowsForActiveRanking` allocates per-item distribution arrays.

- **File**: `workspace/imageEditor/model/useImageEditorTransformDraft.ts:60-77` — synchronous in-render `if (syncedDraftState !== draftState) setDraftState(...)` triggers second render pass on item switch.

- **File**: `library/pages/MyListsPage.tsx:73-90` — `visibleBoards` runs filterLibraryBoards + searched.filter + sortLibraryBoards each filter change. Already deferred via `useDeferredValue`. Acceptable.

### 8.12. Eager Convex subscriptions

- `marketplace/components/consensus/HeroRailCards.tsx:131-145` — Subscribed eagerly on detail page mount. Above-the-fold; acceptable.
- `marketplace/components/CommunityConsensusSection.tsx:367-374` — `useTemplateRankingAggregateItems` always subscribed when `itemsEnabled`.
  - Suggested change: wrap consensus in IntersectionObserver, skip query until visible.

### 8.13. Re-creating callbacks in render

- **File**: `marketplace/pages/TemplatesGalleryPage.tsx:229-238` — `handleSearchChange` fresh closure per render. `SearchInput` not memoized — invalidation doesn't matter currently.

- **File**: `library/components/BoardCard.tsx:62-77` — `BoardCardImpl` is `memo` but parent `MyListsPage:274-284` passes `(b) => void openBoard.open(b)` inline — defeats the memo.
  - Impact: medium.
  - Suggested change: hoist `onOpen` to a stable `useCallback`. Same for `BoardListTable`.

- **File**: `marketplace/components/consensus/ConsensusTierRows.tsx:142-211` — `TierItemButton` not memoized.

- **File**: `library/pages/MyListsPage.tsx:262-263, 279` — `(board) => void openBoard.open(board)` and `(b) => void openBoard.open(b)` — same instability for both grid and list.

### 8.14. Eager image decoding / canvas work

- **File**: `workspace/annotation/model/useAnnotationCanvas.ts:196-213` — `redraw(history)` runs on every history change. For long stroke counts, O(strokes × points). Synchronous.

- **File**: `workspace/imageEditor/model/useImageEditorAutoCropItem.ts:105-109` — `warmImageHashes([autoCropHash])` per item selection. `warmImageHashes` debounced via cache. Acceptable.

- **File**: `marketplace/data/coverImageUpload.ts:71-93` — `resizeImageToPngBlob` decoded twice when called via `Promise.all`. Acceptable; just two synchronous canvas ops.

### 8.15. JSON parses / serializes

- `workspace/boards/data/local/boardStorage.ts:73-92, 127-138` — `JSON.stringify(value)` for envelope and sync state on every save. Debounced 300ms. Acceptable.
- `marketplace/model/useRecordTemplateView.ts:36-37` — `JSON.stringify([...slugs])` on every persist.
- `workspace/boards/model/slices/undoSlice.ts:24-45` — `extractBoardData(state)` allocates fresh `BoardSnapshot`. Diff path is ref-based — no JSON involved. Good.

### 8.16. Inline `.map().filter()` chains

- **File**: `workspace/imageEditor/model/useImageEditorAutoCropAll.ts:71-73` — `!autoCropProgress.running && areCachedAutoCropsApplied(filteredItems, ...)` runs every render. For 200 items × multiple parent re-renders, walks 200 items repeatedly.
  - Impact: medium.
  - Suggested change: wrap in `useMemo`.

- **File**: `marketplace/components/consensus/HeroRailCards.tsx:147-152` — `divisive` and `strongest` filter+slice every render.

### 8.17. Repeated computations across components

See T8 — `getBoardItemAspectRatio`, `resolveTierColorSpec`, `useCurrentPaletteId`.

### 8.18. localStorage / IndexedDB writes per keystroke

Inline edits use `useDeferredValue` (MyListsPage) or `useUrlFilterParams` debounced (`useGalleryFilters` 250ms, `useLibraryFilters` 200ms). No write-per-keystroke seen.

### 8.19. Heavy lazy-load barrels

- `loadPublishModal.ts`, `loadImageEditorModal.ts` — modals dynamically imported via lazy + LazyModalSlot. Good.
- `BoardManager.tsx:40-50` — `RecentlyDeletedModal` and `RecentSharesModal` lazy. Good.
- `TierRow.tsx:55-61` — `CustomColorPicker` lazy with preload trigger. Good.

### 8.20. Over-eager data prefetch

- `TemplateHero.tsx:111-114` — `useTemplateBookmarkState` only when signed in. Acceptable.
- `TemplateDetailPage.tsx:179-182` — aggregate eagerly subscribed. Aggregate small. Acceptable.
- `BoardCard.tsx:79-91` — Cover images use `loading="lazy"` and `decoding="async"`. Good.

### 8.21. Other notable findings

- `workspace/boards/dnd/dragCollision.ts:40-46` — `new Set(useActiveBoardStore.getState().tiers.map(...))` per collision check. Tier drag is short-lived; acceptable.

- `workspace/boards/ui/TierList.tsx:95-107` — `useActiveBoardStore.subscribe(state => state.keyboardFocusItemId, ...)` imperative setAttribute. Good pattern.

- `workspace/boards/dnd/useDragAndDrop.ts:151-175` — pointerdown listener attached to `document` whenever keyboardMode is non-idle. Re-installs on every keyboardMode flip.
  - Suggested change: install once; check keyboardMode inside handler.

- `marketplace/components/consensus/ItemPopover.tsx:47-64` — `mousedown` and `keydown` document listeners attached/detached on every popover open/close. Acceptable.

- `workspace/sync/useWorkspaceBoardSyncSubscriber.ts:35-91` — Two effects: ref refresh on every render, subscribe lifecycle keyed on `[shouldProceed]`. Standard ref-pattern.

- `workspace/boards/dnd/dragLayoutSession.ts:43-76` — `Array.from(querySelectorAll(...)).flatMap(element => ...getBoundingClientRect())` runs on every drag-end resync. For 200 items, 200 rect reads in tight loop. Bounded to drag-end paths.

- `marketplace/model/useTemplatesGallery.ts:71-89` — `galleryArgs` useMemo deps include `accessRefreshKey` (string), category, search, sort, tag — all primitives, stable.

- `marketplace/pages/TemplatesGalleryPage.tsx:107-117` — `galleryAccessRefreshKey` computed inline as `${session.user._id}:${session.user.plan}` per render. Inside `useTemplatesGallery`, args useMemo deps on `[accessRefreshKey, ...]` — string equality holds across renders.

- `platform/preferences/data/cloud/cloudSync.ts:122-130` — Subscribes with `equalityFn: appPreferencesEqual`. Good.

- `workspace/boards/model/session/boardSessionAutosave.ts:58-74` — Subscribes to boardData fields with `equalityFn: boardDataFieldsEqual` and 300ms debounce. Good.

> **PARTIAL coverage note**: this report ended on a "Summary of recommended priorities" section. Likely under-explored: full `workspace/imageEditor/` audit (only `ImageEditorPane`, `useImageEditorAutoCropAll`, `useImageEditorTransformDraft`, and `useMeasuredElementSize` were touched), `workspace/annotation/`, `workspace/preview/`, deeper `library/` patterns, and `embed/` slice.

---

## 9. Efficiency — `src/shared/` + `src/app/` ⚠️ PARTIAL

> Status: ⚠️ PARTIAL — limit cutoff at 268k tokens / 9m16s. The agent prioritized share/import compression, image-cache LRU, and dismissibleLayer dep instability; under-explored: deeper `shared/board-data/`, `shared/sharing/`, deeper `shared/lib/sync/`.

The hottest issue is **synchronous main-thread CPU on the share/import path** (T14). The share/export pipeline also does **two full snapshot traversals** to collect hashes then re-traverse for transform mapping. Beyond that: `useDismissibleLayer` listener thrash (T9), the IDB image-cache **LRU `pruneCache` doing an `O(n log n)` sort on every blob insertion**, `LiveRegion` adding a 50ms timer on every announcement, the `mediaQueryCache` `Map` never cleared, and `useToastStore.removeToast` always replacing the array even when nothing matches.

### 9.1. Unnecessary re-renders in shared primitives

- **File**: `src/shared/notifications/ToastContainer.tsx:26-31` — `useShallow` over `{toasts, removeToast}`.
  - Impact: low (rare toast traffic).
  - Suggested change: subscribe to `toasts` only; read `removeToast` via `useToastStore.getState()`.

- **File**: `src/app/shells/WorkspaceShell.tsx:42-56` — wide `useShallow` slices. One pulls `runtimeError, clearRuntimeError, addTier, resetBoard` from `useActiveBoardStore`. Any tier/item edit re-runs this selector for every tile.
  - Impact: medium.
  - Suggested change: split — subscribe to `runtimeError` only; read actions via `getState()` in handlers.

- **File**: `src/shared/board-ui/StaticBoard.tsx:71-171` — `memo` without custom equality + spread-prop reconstructions inside parent.
  - Impact: medium for export/embed paths.
  - Suggested change: ensure consumers memoize `appearance`.

- **File**: `src/shared/board-ui/ItemContent.tsx:81-90` — two `useImageUrl` calls per item. For 100+ items in embed/export, that's 200 listener registrations + 2 effects firing `requestCloudImage` per tile.
  - Impact: medium for large boards.
  - Suggested change: call `useImageUrl(refs.primary?.ref.hash)` only; skip fallback subscription when primary non-null.

### 9.2. N+1 patterns

- **File**: `src/shared/board-ui/StaticBoard.tsx:132-162` — per-item label resolution rebuilds `globalLabelDefaults` every iteration. For 100 items, 100 transient objects.
  - Suggested change: hoist `globalLabelDefaults` to `useMemo` outside tier loop.

- **File**: `src/shared/board-ui/ItemContent.tsx:78-90` — per-item `getRenderImageRefs` walks `PRIORITY_ORDER` every render.
  - Suggested change: memoize per item.

- **File**: `src/shared/lib/boardSnapshotItems.ts:68-108` + `:112-121` — two full snapshot traversals back-to-back. `warmFromBoard` (`imageBlobCache.ts:439-465`) does the same traversal.
  - Impact: medium (called on every active-board switch + export).
  - Suggested change: collect both result shapes in a single traversal.

### 9.3. Hot-path bloat

See T14.

- **File**: `src/shared/images/prepareItemRenditions.ts:64-71` — three sequential `canvas.toBlob` calls. `Promise.all` is used (good), but on Safari the three calls serialize. ~6 round-trips through the browser's blob encoder per single-image upload.
  - Suggested change: feed source canvas into `OffscreenCanvas` and encode in parallel via Workers.

- **File**: `src/shared/board-data/boardSnapshot.ts:312-352` — `normalizeBoardSnapshot` allocates fresh objects even when input is already valid. Runs on every persisted-state hydration.
  - Suggested change: detect "already normalized" and return same reference.

### 9.4. Recurring no-op updates

- **File**: `useToastStore.ts:79-82` — `removeToast` rebuilds `toasts` even when id is absent.
  - Suggested change: short-circuit when `next.length === state.toasts.length`.

- **File**: `useToastStore.ts:46-64` — `addToast` overflow drop returns new array unconditionally.
  - Suggested change: short-circuit when empty queue.

- **File**: `debouncedSyncRunner.ts:213-224` — `c.lastFlushed = work` even when reference-equal. `onSuccess` fires every flush; consumers rebuilding sidecar timestamps commit a write per cycle.
  - Suggested change: pass `dedupEqual` result into `onSuccess`.

- **File**: `useModalStack.ts:49-58` — `close` short-circuits but `open` doesn't check payload identity. Re-opening same modal payload triggers full remount/work for `LazyModalSlot` consumers.
  - Suggested change: in `open`, return prev when `prev[key]?.payload === payload`.

### 9.5. Memory leaks

See T10.

### 9.6. Unbounded data structures

See T10.

### 9.7. Heavy synchronous work in shared/lib

See T14.

- **File**: `src/shared/board-data/boardJson.ts:23-35` — `JSON.parse(text)` for board imports synchronous on potentially multi-MB payloads.
  - Suggested change: at minimum `await new Promise(r => setTimeout(r, 0))` before/after; long-term Worker.

- **File**: `src/shared/lib/sha256.ts:5-15` — `let hex = ''; ... hex += ...padStart(2, '0')` for digest. Fine for 32-byte digests; `sha256HexFromBlob` reads MB-sized blobs into memory.

- **File**: `src/shared/lib/binaryCodec.ts:45-64` — `bytesToBase64` builds string concat per chunk. V8 optimizes ropes; Safari does not.
  - Suggested change: `String.fromCharCode.apply(null, chunk)` or `TextDecoder('latin1').decode(chunk)`.

- **File**: `src/shared/lib/binaryCodec.ts:113-115` — `decodeURIComponent` on percent-encoded data URL is sync.

- **File**: `src/shared/images/imageBlobCache.ts:223-248` — `pruneCache` does `[...cache.entries()].filter(...).sort(...)` on every overflow insertion. `O(n log n)` per overflow.
  - Impact: medium for large boards.
  - Suggested change: maintain a min-heap or `lastAccessedAt`-keyed insertion-ordered Map.

### 9.8. Bundle size hogs

- **File**: `src/app/shells/topNav/TopNavAccountMenu.tsx:4-11` — `lucide-react` imports 4 icons eagerly.
  - Impact: low (~few KB per icon).
  - Suggested change: lazy-load the menu chunk.

- **File**: `src/shared/notifications/ToastContainer.tsx:1-7` — `import { X } from 'lucide-react'` on always-mounted component.
  - Suggested change: replace with inline SVG or text "×".

- **File**: `src/shared/board-ui/StaticBoard.tsx:21-37` — pulls `~/shared/theme/textStyles.ts` (Google Fonts URL builder) into embed/export bundles.
  - Suggested change: pre-flatten `TEXT_STYLES` at build time.

- **File**: `src/shared/board-data/boardWireMapper.ts:1-42` — pulls IDB write code into shared/board-data; embed route's share-fragment decode pulls IDB writes.
  - Impact: medium.
  - Suggested change: split `wireToSnapshot` into a "lite" (no persist) variant for embed.

- **File**: `src/app/main.tsx:6` — eager `ConvexAuthProvider`. Convex auth required for sync but not embed.
  - Impact: medium for embed.
  - Suggested change: separate entrypoint for embed; or hoist `ConvexAuthProvider` under the router.

### 9.9. Layout thrash

- **File**: `src/shared/board-ui/FramedItemMedia.tsx:64-87` — `useLayoutEffect` + `ResizeObserver` per tile that has manual transform. Synchronous `getBoundingClientRect` inside ResizeObserver callback.
  - Impact: medium for boards with many manually-cropped items.
  - Suggested change: coalesce multi-frame observer firings via `requestAnimationFrame`.

- **File**: `src/shared/overlay/anchoredPopup.ts:74-82` — `useLayoutEffect` with `updatePosition()` runs for every `open` toggle. Multiple stacked popups means each scroll tick reads N rects.
  - Suggested change: throttle position updates via rAF.

- **File**: `src/shared/overlay/focusTrap.ts:46-49` — `getFocusableElements` runs `querySelectorAll` + visibility filter on every Tab keypress. O(N) per Tab including layout-forcing read.
  - Impact: medium for complex modals.
  - Suggested change: cache focusable list when modal opens; invalidate via MutationObserver.

- **File**: `src/shared/overlay/menuOverflow.ts:84-90` — `applyMenuOverflowFlip` reads `getBoundingClientRect()` synchronously on ref assign.
  - Suggested change: defer to rAF.

### 9.10. Theme application doing full repaints on minor changes

- **File**: `src/shared/theme/runtime.ts:11-27` — `applyThemeTokens` writes 20+ CSS variables per call. Each `setProperty` invalidates style recalculation across the document.
  - Suggested change: diff-write — `if (root.style.getPropertyValue(prop) === value) continue;`. Or precompute a single `data-theme="midnight"` attribute and let CSS define variables per attribute selector.

- **File**: `src/shared/theme/runtime.ts:40-68` — `applyTextStyle` does DOM probe + insert/remove of `<link>` per call.
  - Suggested change: keep module-level cache of `currentStyleId`.

- **File**: `src/app/index.css:39-42` — `:root` font-family set both via CSS and `applyTextStyle`. One reflow at app boot.

### 9.11. CSS / animation perf

- Animations use transform/opacity (good). `shake-x` keyframes well-formed.
- `BaseModal.tsx:62-68` — `setShaking(false); requestAnimationFrame(() => setShaking(true))` causes two state updates.
  - Suggested change: CSS animation restart trick (`element.classList.remove; void offsetWidth; classList.add`).

- **File**: `src/shared/board-ui/FramedItemMedia.tsx:118-126` — `willChange: 'transform'` set for every manual-cropped tile. Per-item compositor layer permanently allocated.
  - Impact: medium for large cropped boards.
  - Suggested change: only set `willChange` while transform animation in progress.

- **File**: `src/shared/notifications/ToastContainer.tsx:44` — Tailwind 4 inline animation utility re-parses on every render.
  - Suggested change: define static class.

### 9.12. Unstable deps in shared hooks

See T9.

- **File**: `src/shared/hooks/useAbortControllerHandle.ts:43-46` — `useMemo` with `[abort, begin, clear, current]`. Cosmetic.
  - Suggested change: replace with `useRef`.

- **File**: `src/shared/hooks/useInlineEdit.ts:137-173` — `getInputProps` is `useCallback` with `[editValue, handleBlur, handleKeyDown]`. `editValue` changes every keystroke; new object every keystroke.
  - Suggested change: split props that don't depend on `editValue` from those that do.

- **File**: `src/shared/overlay/dismissibleLayer.ts:158-169` — see T9.

- **File**: `src/shared/overlay/anchoredPopup.ts:46-49` — "always-latest" pattern works correctly. No issue.

- **File**: `src/shared/overlay/nestedMenus.ts:227-231` — `useMemo` rebuilding index on every `definitions` reference change. Acceptable when caller declares as module-scope const.

### 9.13. Eager subscriptions in providers

- `useToastStore.ts:66-74` — `setTimeout` started before subscriber check. Acceptable.
- `a11y/announce.ts` + `LiveRegion.tsx:32-43` — module-level `announceFn` callback. Risk if two LiveRegions mount briefly during route transition.
  - Suggested change: refcount the announcer; restrict to single mount in `AppChromeLayout`.

- `LiveRegion.tsx:17-29` — `handleAnnounce` always schedules a 50ms timer.
  - Suggested change: replace with key-changing strategy.

- `imageBlobCache.ts:24` — `cloudBatchFetcher` registered globally. After sign-out, reference stays.
  - Suggested change: expose `unregisterCloudImageFetcher`.

### 9.14. localStorage reads on every render

- `lib/storageMetering.ts:23-44` — `getStorageUsageBytes` iterates every localStorage key every call. O(N) per invocation.
  - Suggested change: cache result; invalidate on `setItem`.

- `lib/browserStorage.ts:10-18` — `getBrowserStorage()` returns `localStorage` reference per call. Negligible.

- `lib/localSidecar.ts:30-42` — `load()` reads + parses every call. No memoization.
  - Suggested change: lazy-cache; invalidate on `save()`/`clear()`.

### 9.15. Missing change detection in store subscriptions

- `useToastStore.ts:41` — base `create` (no `subscribeWithSelector`/shallow compare). Consumers use `useShallow`. See §9.4.

- `lib/autoCrop.ts:42-43` — `emitScanCacheChange` increments version + calls every listener even when only one hash changed.
  - Suggested change: subscribe-by-hash or accept equality gate.

### 9.17. Eager imports in main / app

- `main.tsx:6` — `ConvexAuthProvider` eager-mounted at root. Embed doesn't need it.

- `main.tsx:9-10` — `getConvexClient()` runs on module load. Pre-warms connection — feature.

- `routes/AppRouter.tsx:14-17` — `AppChromeLayout`, `WorkspaceRoute`, `NotFoundRoute` eager-imported. NotFoundRoute is rare.
  - Suggested change: `lazy()` `NotFoundRoute`.

- `routes/AppChromeLayout.tsx:9-12` — eager import of `useCloudSync` even before sign-in.
  - Impact: medium — unauthenticated marketplace browsing pays sync code.
  - Suggested change: gate via `await import('...')` after auth resolution.

### 9.18. Synchronous JSON.parse on every store read

- `lib/browserStorage.ts:69-70` — `createAppPersistStorage` uses `createJSONStorage`. Only invokes `JSON.parse` during hydration. No per-render parse. OK.

- `lib/localSidecar.ts:30-42` — see §9.14.

### 9.19. `@dnd-kit` listener registration

Out of zone. No findings.

### 9.20. Repeated computations of derived values

- **File**: `src/shared/board-ui/aspectRatio.ts:97-110, 127-142, 152-166, 170-180, 185-191` — `Object.values(board.items)` walked 5 different times by public API.
  - Suggested change: callers pass single derived `itemList` once per render.

- **File**: `src/shared/lib/boardSnapshotItems.ts:140-179` — `mapSnapshotItems` always builds new `nextItems` via `Object.fromEntries` even when nothing changed.
  - Suggested change: change-check first-pass loop; rebuild only when needed.

- **File**: `src/shared/board-data/boardSnapshot.ts:243-275` — `selectBoardDataFields` always allocates new object of 13 fields per call.

- **File**: `src/shared/lib/imageRefs.ts:54-82` — `getImageRefsByRendition` and `getPrimaryImageRef` each call `getImageRenditionRefs` separately.
  - Suggested change: provide `pickRefBundle(item, rendition)` returning `{ refs, primary, fallback, hasAny }` in one pass.

- **File**: `src/shared/lib/boardSnapshotItems.ts:200-217` — `transformSnapshotItemsAsync` builds `tasks` array with per-task object allocation.

### 9.21. Cross-cutting recommendations (priority order)

1. Stabilize `useDismissibleLayer` deps (T9) — single biggest re-bind churn cause for popups.
2. Move share/import compression to Workers (T14).
3. Add LRU eviction to `imageBlobCache.pruneCache` and `imageStore.memoryBlobs` (T10).
4. Coalesce `useImageUrl` into one subscription per tile (§9.1).
5. Diff-write `applyThemeTokens` and avoid `setProperty` no-ops (§9.10).
6. Provide single `forEachSnapshotItem`-style pass deriving mismatched + ratios + hashes in one loop (§9.2, §9.20).
7. Cache `localSidecar.load` (§9.14).
8. Replace `lucide-react` named imports in always-mounted components (§9.8).
9. Stabilize `WorkspaceShell.tsx`'s `useShallow` (§9.1).
10. Make per-tile `willChange:'transform'` conditional (§9.11).

### Efficiency-shared prior-review reconciliation

- **react-best-practices-audit-2026-04-30 F-09** (passive scroll listener): **FIXED** at `dismissibleLayer.ts:9` (`SCROLL_LISTENER_OPTIONS = { capture: true, passive: true }`).
- **F-02** (lazy `html-to-image`): plumbing in `lib/lazyDependencies.ts:40-48`.
- **F-01 / F-07** (lazy ImageEditorModal / PublishModal): **FIXED** via `WorkspaceModalLayer.tsx:43-65` and `loadPublishModal`.
- **F-04 / F-05 / F-06 / F-08**: out of zone.
- **simplify-review-2026-04-18 T2** (board scheduler vs `debouncedSyncRunner`): unchanged. Out of zone for fix; the runner is well-designed.

> **PARTIAL coverage note**: this report ended on a "Reconciliation with prior reviews" section. Likely under-explored: `shared/board-data/` deep dive, `shared/sharing/` (only `hashShare.ts:75-83` was hit), `shared/lib/sync/` beyond `debouncedSyncRunner`, `shared/selection/`.

---

## 10. Efficiency — Convex backend + `packages/contracts/`

> Status: ✅ complete — 324k tokens, 7m48s.

Several high-impact issues found. Most critical: (1) the per-write `incrementAggregateItem` path serializes one indexed lookup + one full document `patch` per ranking item — for a published ranking with N items it does N×(read+rewrite-of-distribution-array) within the aggregate job; (2) `gcOrphanedMediaAssets` and `gcOrphanedStorage` page through their full tables nightly without any time-bounded index; (3) `recomputeTemplateTagsImpl` and `clearSeededTemplateCovers` use `.collect()` on entire `templates` table; (4) **8 dead schema indexes** still declared (T12); (5) `templateRankingAggregateItems` has 20+ multi-column indexes (T15); (6) `getTemplatesGallery` issues 4 separate index reads to populate gallery rails on every fetch.

### 10.1. Full-table scans

See T18.

- **File**: `convex/marketplace/templates/seed.ts:625` — `recomputeTemplateTagsImpl` collects entire `templates`.
- **File**: `convex/marketplace/templates/seed.ts:787` — `clearSeededTemplateCovers` collects entire `templates`.
- **File**: `convex/marketplace/templates/seed.ts:445-449` — `clearAllFeaturedRanksImpl` `for await` over indexed cards.
- **File**: `convex/marketplace/templates/seed.ts:556` — `recomputeMarketplaceStatsImpl` `for await` over public cards.
- **File**: `convex/marketplace/templates/seed.ts:847-918` — `wipeSeededDataBatchImpl` uses `.collect()` per-template/per-board.
- **File**: `convex/marketplace/templates/seed.ts:899-902` — `wipeSeededDataBatchImpl` forkedBoards path uses `.withIndex('bySourceTemplate').take(WIPE_BATCH_BOARDS)` without binding `sourceTemplateId` — pages through ALL boards then post-filters.
  - Impact: low.
  - Suggested change: range-bind index, or restructure per-source-template.

- **File**: `convex/marketplace/templates/internal.ts:640` — `recomputeTemplateTrendingScores` paginates `templateCards` w/o index filter. See T21.

### 10.2. N+1 reads

- **File**: `convex/marketplace/templates/queries.ts:311-313` — `takePublicRowsByTag` issues per-tag-row card lookup. N indexed reads for N tag rows, parallel.
  - Suggested change: denormalize slug+title onto `templateTags`.

- **File**: `convex/marketplace/templates/internal.ts:187-197` — `processTemplatePublishJob` issues per-item `byTemplateAndExternalId` lookup. 100 lookups per page just to detect already-seeded items.
  - Suggested change: gate existence check on retry-only.

- **File**: `convex/marketplace/templates/internal.ts:362-371` — `processTemplateCloneJob` same shape for clone jobs.

- **File**: `convex/marketplace/templates/queries.ts:696-702` — `getMyTemplateDrafts` per-template `db.get`. Bounded; document.

- **File**: `convex/platform/media/queries.ts:71-77` — `isMediaReferencedByUserBoard` does N `ctx.db.get(boardId)` per page. Worst case 4096 board reads for one permission check.
  - Impact: medium.
  - Suggested change: project `ownerId` onto `boardItems` (denormalized; updated on board create only).

- **File**: `convex/platform/media/queries.ts:104-107` — `isMediaReferencedByTemplate` same N+1 shape.
  - Suggested change: add `templatePublicationState` to `templateItems`.

- **File**: `convex/marketplace/rankings/aggregateInternal.ts:203-211` — `incrementAggregateItem` per-item indexed read inside ranking-items page. 80 reads + 80 patches per page, sequenced via `Promise.all`. With 1000 rankings × 100 items, recompute is 100k reads + 100k writes. **Dominant cost.** See T15.
  - Suggested change: pre-load all aggregate items for the (template, generation) into a Map at start of each ranking; reuse across `Promise.all`.

- **File**: `convex/marketplace/rankings/seed.ts:879-893` — `resolveSeedTargetsImpl` sequential per-target template lookups. 3 targets bounded.

- **File**: `convex/marketplace/rankings/mutations.ts:181` — `buildOrderedRankingItems` calls `requireTemplateItem` per item sequentially. With 100 items, 100 sequential `db.get` calls.
  - Suggested change: pre-load via `loadTemplateItems(ctx, template._id)` into Map; lookup synchronously.

### 10.3. Missing pagination / unbounded `.collect()`

See §10.1. No public queries return `.collect()` results to clients. The unbounded `.take(MAX_*)` pattern is consistent.

### 10.4. Missed parallelism

- **File**: `convex/marketplace/rankings/mutations.ts:163-185` — sequential `await requireTemplateItem` (also §10.2).

- **File**: `convex/platform/media/internal.ts:336-340` — `deleteMediaAssetWithVariants` sequential variant deletes. Up to 6 variants. Independent.
  - Suggested change: `Promise.all`.

- **File**: `convex/platform/shortLinks/internal.ts:101-107` — `gcExpiredShortLinks` sequential row deletes. 64 sequential rounds.
  - Suggested change: `Promise.all`.

- **File**: `convex/platform/media/internal.ts:382-387` — `gcOrphanedMediaAssets` sequential deletion.

- **File**: `convex/platform/media/internal.ts:189-202` — `insertMissingVariants` for-loop awaits sequentially.

- **File**: `convex/platform/media/internal.ts:264-285` — `finalizeVerifiedMediaAssets` sequential per-asset finalization.
  - Suggested change: group by dedupeHash; run unique groups in parallel.

- **File**: `convex/marketplace/templates/lib.ts:691-710 / 719-738` — `incrementTemplateUseStats` / `incrementTemplateViewStats` already parallelize via `Promise.all`. ✓

- **File**: `convex/users.ts:482-497` — `handleRankingsPhase` parallel ✓.

- **File**: `convex/users.ts:451-463` — `handleTemplatesPhase` two sequential `Promise.all`s. Could combine.

- **File**: `convex/marketplace/templates/mutations.ts:184-218` — `findActivePublishJobForBoard` / `findActiveCloneJobForTemplate` parallel `take(1)` per status. ✓

### 10.5. Redundant index reads

- **File**: `convex/marketplace/rankings/aggregateInternal.ts:258-267` — `processActiveRanking` now also loads the template to derive label-aware target bucket labels before loading ranking tiers. This fixes bucket-label semantics, but adds another repeated read per scheduled item page.
  - Suggested change: snapshot target bucket labels and the resolved tier-bucket map onto the job row once when `activeRankingId` is set.

- **File**: `convex/marketplace/rankings/aggregateInternal.ts:252` — calls `isLatestPublicRankingForOwner` for every page of items. Latest-ness doesn't change mid-scan.
  - Suggested change: cache result on job row (`activeRankingIsLatest: boolean`).

- **File**: `convex/marketplace/templates/lib.ts:691-710` — `incrementTemplateUseStats` does 3 reads per increment.
  - Suggested change: denormalize `category` onto `templateStats`.

- **File**: `convex/marketplace/rankings/queries.ts:399-432` — `getRankingsForTemplate` runs same template lookup as `listRankingsForTemplate`. Different subscriptions.

### 10.6. Schema indexes — dead / unused

See T12.

### 10.7. Schema indexes — write amplification on aggregate items

See T15.

### 10.8. Cron job frequency

See T21.

- **File**: `convex/crons.ts:97-103` — aggregate scheduler every 2 hours. Walks all public template cards.
  - Suggested change: use `templateRankingAggregates.byStateAndUpdatedAt` (currently dead) directly.

- **File**: `convex/crons.ts:53-88` — four daily GC crons. `mediaAssets` and `_storage` GC scans full tables nightly regardless of age. `GC_GRACE_MS = 1 hour` applied AFTER reading, not as index range.
  - Impact: medium (scales linearly).
  - Suggested change: paginate via `_creationTime` ordering; bail when `_creationTime > now - GC_GRACE_MS`.

### 10.9. Aggregate maintenance — write contention

See T15.

- **File**: `convex/marketplace/rankings/aggregateInternal.ts:228-235` — `incrementAggregateItem` patches entire `distribution` array on every increment.
  - Suggested change: move `distribution` to child table `templateRankingAggregateDistribution`; OR collect deltas in memory across all rankings, write once at end.

- **File**: `convex/marketplace/templates/lib.ts:704-708` — `incrementTemplateUseStats` patches both `templateStats.useCount` AND `templateCards.useCount`. `templateCards.useCount` in sort key for two indexes.
  - Suggested change: batch via debounced internal mutation (Convex aggregate-component pattern).

### 10.10. `ctx.db.replace`

None observed. All writes use `ctx.db.patch` with diffs. Good.

### 10.11. Cascade-delete loops

All cascade paths already parallelize. Good.

### 10.12. Storage operations

- **File**: `convex/marketplace/templates/lib.ts:1014` — `toTemplateCardMedia` reads asset for cover preview. Inside `Promise.all([toTemplateCardMedia, toTemplateCardCoverItems])` — `toTemplateCardCoverItems` ALSO calls `toTemplateCardMedia` per item. No `assetCache` shared.
  - Suggested change: thread cache through.

- **File**: `convex/marketplace/rankings/mutations.ts:431` — `loadMediaVariantStorageId` per item in `Promise.all`. Possible repeated assets.

- **File**: `convex/marketplace/templates/internal.ts:294` — clone-board summary loads tile storageId per item. Bounded by `LIBRARY_BOARD_COVER_ITEM_LIMIT = 8`.

- **File**: `convex/platform/shortLinks/queries.ts:53` — `resolveSlug` fetches signed URL on every public read. Correct (signed URLs need freshness).

### 10.13. Rate-limit overhead

- `convex/lib/rateLimiter.ts` — `userMediaUpload` rate `1000/HR, capacity: 1000`. Effectively no-op for normal usage; still costs a write per upload-URL request.
  - Suggested change: keep as kill-switch, or remove if abuse not a real risk.

### 10.14. Validators

No `v.any()` usage. Good.

- `convex/lib/validators.ts:559-565` — `tierPresetCloudRowValidator` includes unbounded `tierPresetTiersValidator` array. Practical limit lives in client/contracts.

### 10.15. Public queries returning bloated payloads

See T16.

- **File**: `convex/marketplace/templates/lib.ts:1309-1357` — `toTemplateCardSummary` returns ALL counter fields. Each counter increment changes payload; invalidates subscriptions.
  - Suggested change: project to leaner summary for list views.

- **File**: `convex/marketplace/rankings/queries.ts:606-617` — `getMyRankings` projects entire summary including author resolution.
  - Suggested change: denormalize author display fields onto `publishedRankings`.

### 10.16. Subscriptions amplification

See T17.

- **File**: `convex/schema.ts:81-140` — `boards.librarySummary` lives on board row. Every revision bump re-emits entire row to all subscribers (including `getMyBoards` which doesn't read it).
  - Suggested change: keep separate from boards if it churns more.

- **File**: `convex/schema.ts:469-528` — `publishedRankings.viewCount` + `topScore` on parent row. Every view bump re-emits.
  - Suggested change: move counters to child table.

### 10.17. Internal mutations

No internal mutations doing UI-only formatting. Good.

### 10.18. Action functions doing DB work

- **File**: `convex/platform/media/uploads.ts:262-264` — `finalizeVariantsImpl` `for...of` w/ `await` (sequential). Variants independent.
  - Suggested change: `Promise.all`.

- `convex/marketplace/templates/seed.ts:328-331` — parallelizes tile/preview ✓.
- `convex/marketplace/rankings/seed.ts:1184-1264` — delegates to `internalMutation` for DB work ✓.

### 10.19. HTTP routes / cors

`convex/http.ts` — only `auth.addHttpRoutes(http)`, no custom routes. Minimal.

### 10.20. Seed scripts — bulk insert

- `templates/seed.ts:266-281` — parallelizes `templateItems` ✓.
- `rankings/seed.ts:1117-1136` — parallelizes ranking item inserts ✓.
- `rankings/seed.ts:1006-1029` — parallelizes board tier inserts ✓.

- **File**: `convex/marketplace/rankings/seed.ts:1158-1162` — `queueSeedAggregateRecomputeImpl` sequential `await`. Only 3 templates seeded. Acceptable.

### 10.21. Missing `paginationOpts` / `.take(N)` instead of true pagination

Several `.take(MAX_*)` patterns: `getMyBoards` (200), `getMyDeletedBoards`, `getMyLibraryBoards`, `getMyTierPresets` (200), `getMyRankings`, `getMyTemplates`, `getMyShortLinks`. All bounded `.take()` on indexed queries. Inconsistent — `listMyTemplateBookmarks` and `listRankingsForTemplate` use proper pagination.

- Suggested change: unified pagination story.

### 10.22. Aggregate write contention

- **File**: `convex/marketplace/templates/lib.ts:530-568` — `marketplaceStats` uses single `byKey: 'templates'` row for all category counts. Every publish/unpublish/category-change patches same row. Convex serializes writes to same doc → contention under load.
  - Suggested change: Aggregate component, or shard by category.

- **File**: `convex/marketplace/rankings/aggregate.ts:163-187` — `queueTemplateRankingAggregateRecompute` patches aggregate row. Concurrent ranking publishes for same template collide. Acceptable for user-paced.

- **File**: `convex/marketplace/templates/lib.ts:683-711` — `incrementTemplateUseStats` updates 3 contending docs per template. Same-day writes collide on `templateMetricDays` row.

### 10.23. Branch-specific findings (`feat/marketplace-ranking-aggregates`)

- **File**: `convex/marketplace/rankings/aggregateInternal.ts:328-336` — `selectNextRanking` paginates ONE ranking at a time (`numItems: 1`).
  - Suggested change: page in larger batches; process in parallel within each invocation.

- **File**: `convex/marketplace/rankings/aggregateInternal.ts:485-509` — `scheduleTemplateRankingAggregateRecomputes` does N indexed `findTemplateRankingAggregate` calls per page. N+1.
  - Suggested change: use dead `templateRankingAggregates.byStateAndUpdatedAt` index — flips join to "what's stale?".

- **File**: `convex/marketplace/templates/internal.ts:431-557` — `cascadeDeleteTemplate` walks 4 phases. For templates that never had a public ranking, aggregate-items phase still paginates empty index.
  - Suggested change: check if aggregate exists before scheduling that phase.

- **File**: `convex/marketplace/rankings/mutations.ts:438-454` — Three patches in parallel including `incrementTemplateUseStats` which itself does multiple parallel patches. Acceptable (different docs).

- **File**: `convex/marketplace/templates/bookmarks.ts:155-169` — `listMyTemplateBookmarks` does per-bookmark `findTemplateCardByTemplateId`. N+1 (parallelized).
  - Suggested change: denormalize bookmark→cardId at write time.

### 10.24. Top recommendations (priority order)

1. **Reduce write amplification on `templateRankingAggregateItems`** (T15).
2. **Snapshot target bucket labels, `tierBucketMap`, and `isLatest` on the aggregate job row** (§10.5).
3. **Pre-load aggregate items per (template, generation)** (§10.2 / T15).
4. **Split `getTemplatesGallery`** into per-rail queries (T16).
5. **Drop the 8 dead indexes** (T12).
6. **Move trending recompute to public-only**, drop frequency to ≥4h (T21).
7. **Replace ownership scans in media reference checks** by denormalizing `ownerId`/`publicationState` (§10.2).
8. **Paginate `recomputeTemplateTagsImpl` and `clearSeededTemplateCovers`** (T18).
9. **Replace per-item `requireTemplateItem` in `buildOrderedRankingItems`** with batch load (§10.2).
10. **Move `templateCards.useCount`/`viewCount` to a child table** (T17).

### Efficiency-backend prior-review reconciliation

- **`media/internal.ts` `bySnapshotStorageId` full-table scan**: **FIXED**. `gcOrphanedStorage` now uses indexed lookups.
- **4 dead indexes from prior review**: PARTIALLY FIXED. Current dead set: 8 indexes (T12).

---

## Files cited (highlights)

Front-end:

- `src/features/marketplace/components/{Card,Hero,Mosaic,InitialsGrid,DraftRail,Rail,SearchInput,ShareTemplateButton,CoverImageInput,PublishModal,PublishRankingModal,TemplateHero,UseTemplateButton,TagsInput}.tsx`
- `src/features/marketplace/components/consensus/{ConsensusToolbar,ConsensusBars,ConsensusHeatmap,ConsensusRanked,ConsensusTierRows,ConsensusScatter,ConsensusFeaturedSpotlight,ConsensusRankingsRail,ItemPopover,HeroRailCards,usePopover,utils}.{ts,tsx}`
- `src/features/marketplace/data/{rankingsRepository,templatesRepository,coverImageUpload}.ts`
- `src/features/marketplace/model/{useRecordRankingView,useRecordTemplateView,usePublishRanking,usePublishTemplate,useRemixRanking,useUseTemplate,useUpdateTemplate,useOpenTemplateDraft,useCompareRanking,useTemplatesGallery,useRankingPublishAvailability,useRankingDetail,useTemplateDetail,formatters}.ts`
- `src/features/marketplace/pages/{TemplateDetailPage,RankingDetailPage,TemplatesGalleryPage,MarketplaceLayout}.tsx`
- `src/features/library/{components,model,pages,lib}/*`
- `src/features/workspace/boards/dnd/{useDragAndDrop,dragSnapshot,dragCollision,dragLayoutSession}.ts`
- `src/features/workspace/boards/model/slices/{boardDataSlice,dragPreviewSlice,selectors,helpers,undoSlice}.ts`
- `src/features/workspace/boards/ui/{TierItem,TierRow,TierList,UnrankedPool,DragOverlayItem,BulkActionBar,BoardActionBar,BoardManager,ItemContextMenu,TierLabel}.tsx`
- `src/features/workspace/imageEditor/{model,ui}/*`
- `src/features/workspace/sharing/ui/{ShareModal,RecentSharesModal}.tsx`
- `src/features/workspace/export/model/useExportController.ts`
- `src/features/workspace/annotation/{model,ui}/*`
- `src/features/platform/auth/ui/{AccountModal,AccountDangerZone,AccountSessionsSection,AccountProfileSection,SignInModal}.tsx`
- `src/features/platform/preferences/{model,data}/*`
- `src/features/platform/sync/{lib,orchestration,state}/*`

Shared/app:

- `src/shared/{board-data,board-ui,overlay,ui,hooks,lib,images,sharing,theme,a11y,notifications,routes,layout,catalog,selection}/*`
- `src/app/{App,main,index.css}`
- `src/app/{bootstrap,routes,shells}/*`

Backend:

- `convex/auth.config.ts`, `convex/auth.ts`, `convex/crons.ts`, `convex/http.ts`, `convex/schema.ts`, `convex/users.ts`
- `convex/lib/{auth,base64,cascadeDelete,entitlements,hexColor,imageValidation,limits,mediaVariants,permissions,rateLimiter,sha256,storage,templateProgress,text,uploadToken,userUpsert,validators}.ts`
- `convex/marketplace/rankings/{aggregate,aggregateInternal,internal,lib,mutations,queries,seed}.ts`
- `convex/marketplace/templates/{bookmarks,internal,lib,mutations,queries,seed}.ts`
- `convex/platform/media/{internal,queries,uploads}.ts`
- `convex/platform/preferences/{mutations,queries}.ts`
- `convex/platform/shortLinks/{internal,listing,mutations,queries}.ts`
- `convex/workspace/boards/{cloudFields,internal,librarySummary,mutations,queries,upsertBoardState}.ts`
- `convex/workspace/sync/{boardReconciler,boardStateLoader,loadBoundedBoardRows}.ts`
- `convex/workspace/tierPresets/{mutations,queries}.ts`
- `packages/contracts/lib/{hexColor,ids,math,pagination,theme,themeDefinition,typeGuards}.ts`
- `packages/contracts/marketplace/{category,ranking,rankingAggregate,template}.ts`
- `packages/contracts/platform/{errors,media,preferences,shortLink,uploadEnvelope,user}.ts`
- `packages/contracts/workspace/{board,boardEnvelope,boardSync,cloudBoard,cloudPreset,imageMath,tierPreset}.ts`

Tests:

- `tests/convex/{convexTestHelpers,marketplaceTemplates,userCascade,seedAuthorization,shortLinksIntegration,mediaVariants,boardUpsertLimits,imageValidation}.test.ts`

---

# 11. Top-up findings — gap-filling pass after limit reset

After the original three partial sections (§7, §8, §9) hit the usage-limit ceiling, a second pass was run with each agent narrowly scoped to the under-explored zones identified in those partial sections. Findings below are **net-new** — they do not duplicate the original report. Numbering is `7T-N` / `8T-N` / `9T-N` so a reader can map back to the corresponding original section.

## 11.1. Quality — Convex backend (top-up for §7)

### Summary

This top-up walked every line of both seed scripts (`marketplace/{templates,rankings}/seed.ts`, ~2,650 LOC combined), the platform `preferences/`, `shortLinks/`, and `media/` zones, the `workspace/{boards,sync,tierPresets}/` zones, and `crons.ts`. Net-new findings cluster on (a) **silent transaction-cap risks in seed-script `.collect()` paths** the prior pass missed five additional sites for; (b) **untracked retention** for `templateMetricDays`, `templatePublishJobs`, `templateCloneJobs`, `templateRankingAggregateJobs` — no GC cron exists for any of them; (c) **two duplicated `requireSeedAuthorized` implementations** drifting in punctuation; (d) **three near-identical slug-allocation loops** with one using a different attempt cap; (e) **`Date.now()` called multiple times within single mutations**; (f) **`boardReconciler.diffItems` "pure" function reading `Date.now()`** breaking purity/testability; (g) **`v.union(v.literal('cover'), v.literal('contain'))` repeated 17×** with no shared validator; (h) a **likely bug** in `insertSeedTemplate` setting `itemAspectRatioMode: 'auto'` when ratio is null, contradicting its own comment; (i) **`clearAllFeaturedRanksImpl` lacks pagination** like other unbounded admin paths flagged in T18; and (j) **`wipeSeededDataBatchImpl` boards-phase termination has an infinite-loop trap** when all rows in a page are filtered out.

### 7T-1. Additional `.collect()` / unbounded-read risks in seed scripts (extends T18)

The prior report flagged two sites; five more exist:

- **File**: `convex/marketplace/templates/seed.ts:857` — `templateItems.byTemplate.collect()` in `wipeSeededDataBatchImpl` templates phase
  - Issue: Per-template `.collect()` × `WIPE_BATCH_TEMPLATES = 50` templates per page. A template with 1,000 items × 50 templates = 50,000 reads in one mutation, well above the 4,096 per-mutation cap.
  - Suggested change: replace with `.take(MAX_SEED_TEMPLATE_ITEMS)` + `assertSeedRowsWithinLimit`, or paginate the per-template item delete in its own scheduled phase.

- **File**: `convex/marketplace/templates/seed.ts:861` — `templateTags.byTemplate.collect()` in same loop
  - Issue: same N×M pattern.
  - Suggested change: replace with `.take(TAG_ROW_READ_CAP + 1)` + assertion.

- **File**: `convex/marketplace/templates/seed.ts:911` — `boardItems.byBoardAndTier.collect()` in forkedBoards phase
  - Issue: `WIPE_BATCH_BOARDS = 50` × `MAX_SYNC_ITEMS` (2,000+) items. The narrative comment at 818 promises "mutations stay under the 4096-read txn cap", but this site violates that promise.
  - Suggested change: paginate per-board item delete via `cascadeDeleteBoard`, or move forked-board reaping into the existing per-board cascade scheduler.

- **File**: `convex/marketplace/templates/seed.ts:915` — `boardTiers.byBoard.collect()` same loop. Bounded by `MAX_SYNC_TIERS`, less risky but inconsistent.

- **File**: `convex/marketplace/templates/seed.ts:632` — `templateTags.byTemplate.collect()` inside `recomputeTemplateTagsImpl`'s outer template iteration.
  - Issue: Compounds T18's outer issue: even if outer is paginated, inner per-template tag scan multiplies reads.

### 7T-2. Retention / GC gaps in `crons.ts`

- **File**: `convex/crons.ts:51-103` — no GC for `templateMetricDays`
  - Issue: `recomputeTemplateTrendingScores` reads only the last 7 days, but `incrementTemplateUseStats`/`incrementTemplateViewStats` insert a row per (template, day) forever. After a year, an active template carries 358 dead rows.
  - Suggested change: add a daily cron `gcExpiredTemplateMetricDays` paginating + deleting rows where `dayStartAt < now - TEMPLATE_TRENDING_WINDOW_DAYS * day`.

- **File**: `convex/crons.ts:51-103` — no GC for completed/failed `templatePublishJobs` and `templateCloneJobs`
  - Issue: Schema declares `completedAt`, `canceledAt`, retry counts. No path reaps terminal-state rows.
  - Suggested change: weekly cron reaping terminal-state jobs older than ~30 days.

- **File**: `convex/crons.ts:51-103` — no GC for `templateRankingAggregateJobs`
  - Issue: `aggregateInternal` cleans up old aggregate item generations, but the jobs row sticks around. `deleteTemplateRankingAggregateParentRows` only `.take(16)` jobs.
  - Suggested change: terminal-state job retention sweep, or post-success cleanup.

### 7T-3. Duplicated `requireSeedAuthorized` (and a magic-number drift)

- **File**: `convex/marketplace/templates/seed.ts:376-395` and `convex/marketplace/rankings/seed.ts:426-445` — same function defined twice
  - Issue: Identical bodies except: (a) error-message punctuation differs (em-dash `—` in templates, hyphen `-` in rankings — drift indicator), (b) `SEED_SECRET_ENV` constant duplicated at lines 96 and 45.
  - Suggested change: hoist to `convex/lib/seedAuth.ts`.

### 7T-4. Three slug-allocator loops (refactor opportunity beyond T21)

- **File**: `convex/marketplace/rankings/lib.ts:33,63-79` — `MAX_SLUG_ATTEMPTS = 8`, generic loop
- **File**: `convex/marketplace/templates/lib.ts:112,334-354` — `MAX_SLUG_ATTEMPTS = 8`, identical loop shape
- **File**: `convex/platform/shortLinks/internal.ts:17,37-76` — `SLUG_INSERT_MAX_ATTEMPTS = 5`, similar but different cap
  - Issue: ShortLinks uses 5 attempts vs. 8 elsewhere — inconsistent without rationale.
  - Suggested change: `tryAllocateUniqueSlug<TableName>(ctx, { tableName, indexName, fieldName, generate, maxAttempts })` helper. Standardize cap.

### 7T-5. `Date.now()` called multiple times for fields that should share a timestamp

- `convex/workspace/boards/mutations.ts:110-111` — `deletedAt: Date.now(), updatedAt: Date.now()` — two clock reads.
- `convex/workspace/boards/upsertBoardState.ts:333-340` — three clock reads in one insert literal.
- `convex/workspace/tierPresets/mutations.ts:102` — patch builder reads `Date.now()` after the patch object is constructed.
- `convex/marketplace/rankings/seed.ts:833` — ignores `now` already in scope.
- `convex/platform/media/internal.ts:173,245` — variant `createdAt` and parent `mediaAssets.createdAt` two clock reads in single insert flow.
- `tests/convex/marketplaceTemplates.test.ts:57-58` — `seedUser` reads `Date.now()` twice.

Suggested change: capture `const now = Date.now()` once at the top of each mutation handler.

### 7T-6. `boardReconciler.diffItems` reads the clock — breaks purity claim

- **File**: `convex/workspace/sync/boardReconciler.ts:203` — `const now = Date.now()` inside `diffItems`
  - Issue: File header at line 1 calls these "pure server-side row-diff helpers". Reading the clock makes `diffItems` non-pure.
  - Suggested change: hoist `now` to `applyBoardState` (`upsertBoardState.ts`); pass as parameter.

### 7T-7. `v.union(v.literal('cover'), v.literal('contain'))` repeated 17×

- **File**: `convex/schema.ts` (sites: 99, 167, 239, 262, 462, 552, 585) and `convex/lib/validators.ts` (10 sites) and `convex/workspace/boards/upsertBoardState.ts` (lines 80, 93)
  - Issue: Same union literal copy-pasted across the codebase. Contract type `ImageFit` exists at `packages/contracts/workspace/board.ts:35`; only the validator is missing.
  - Suggested change: add `imageFitValidator = v.union(v.literal('cover'), v.literal('contain'))` to `convex/lib/validators.ts`; replace all sites. ~30 LOC.

### 7T-8. Likely bug: `insertSeedTemplate` aspectRatioMode logic contradicts its own comment

- **File**: `convex/marketplace/templates/seed.ts:250-254`
  - Issue: Comment says "the per-item transforms below were computed against this ratio, so forks must inherit it. mode is 'manual' to pin it". Code at line 254 sets `itemAspectRatioMode: args.itemAspectRatio === null ? 'auto' : 'manual'` — when ratio is `null`, mode becomes `'auto'`, which by the comment's logic is exactly the failure case.
  - Suggested change: when `itemAspectRatio === null`, set `itemAspectRatioMode: null` or `'manual'` to pin. Verify intent.

### 7T-9. Inconsistent `Impl` suffix naming in templates seed

- **File**: `convex/marketplace/templates/seed.ts` — without `Impl`: `findUserByEmail`, `insertSeedTemplate`, `setTemplateFeaturedRank`, `clearSeededTemplateCovers`, `appendItemsToSeededTemplate`. With `Impl`: 9 others.
  - Suggested change: pick one. Either drop `Impl` everywhere or apply it everywhere.

### 7T-10. `clearAllFeaturedRanksImpl` lacks pagination (extends T18)

- **File**: `convex/marketplace/templates/seed.ts:433-463`
  - Issue: `for await (const card of rankedCards)` walks the full `byIsPubliclyListableFeaturedRank` index range, then `Promise.all` over every card. With many featured templates, exceeds 4,096-read mutation cap.
  - Suggested change: paginate via `recomputeTemplateCardsBatchImpl`-style phases.

- **File**: `convex/marketplace/templates/seed.ts:458-461` — `{ cleared, scanned }` always equal
  - Suggested change: drop `scanned` or count actually-scanned templates.

### 7T-11. `MAX_BOARD_STATE_BATCH = 3` is unusually low and unexplained

- **File**: `convex/workspace/boards/queries.ts:31`
  - Issue: caps batch at 3 boards. With each board's `loadBoundedBoardRows` reading up to ~10000 rows, 3×10000 already approaches the 16384 query read limit. Conservative for full-payload boards but restrictive for typical small ones.
  - Suggested change: comment why 3, OR adopt a row-budget based limit.

### 7T-12. `revokeMyShortLink` skips the rate limiter

- **File**: `convex/platform/shortLinks/mutations.ts:156-203`
  - Issue: `generateSnapshotUploadUrl` and `createSnapshotShortLink` are rate-limited; `revokeMyShortLink` is not.
  - Suggested change: add `enforceRateLimit(ctx, 'userShortLink', userId)`.

### 7T-13. `revokeMyShortLink` reimplements `requireCurrentUserId`

- **File**: `convex/platform/shortLinks/mutations.ts:166-173`
  - Issue: Uses `getCurrentUserId` then manually throws ConvexError when null.
  - Suggested change: `const userId = await requireCurrentUserId(ctx); if (!isShortLinkSlug(args.slug)) return null; ...`

### 7T-14. `failInput` vs. inline `throw new ConvexError` inconsistency

- `convex/lib/hexColor.ts:8-17` throws `ConvexError` inline; same shape as `failInput`.
- Seed scripts always throw inline rather than via `failInput`.
- `failInput` IS used in: `preferences/mutations.ts:46`, `upsertBoardState.ts:138`, `users.ts:164`, `rankings/lib.ts:41`.
  - Suggested change: prefer `failInput` everywhere; or eliminate. Pick one.

### 7T-15. `materializationState` override pattern is fragile

- **File**: `convex/marketplace/templates/mutations.ts:388-389`
  - Issue: `...buildFreshBoardCloudFields(now)` spreads `materializationState: 'ready'`, then next line overrides with `materializationState: 'clonePending'`. Works only because of spread order.
  - Suggested change: add `materializationState?` parameter to `buildFreshBoardCloudFields`, or split into a `buildPendingCloneCloudFields` variant.

### 7T-16. `deleteTemplateRankingAggregateParentRows` magic `.take(16)`

- **File**: `convex/marketplace/rankings/aggregate.ts:235`
  - Issue: `.take(16)` for jobs to delete. If a template accumulates >16 jobs (no GC, see 7T-2), excess rows leak.
  - Suggested change: define `MAX_AGGREGATE_JOBS_PER_TEMPLATE` in `lib/limits.ts`; assert via `take(N+1)` + guard.

### 7T-17. `gt('featuredRank', -1)` magic constant duplication

- **File**: `convex/marketplace/templates/queries.ts:141, 150` and `convex/marketplace/templates/seed.ts:442`
  - Issue: Same `q.eq('isPubliclyListable', true).gt('featuredRank', -1)` filter. Convex indexes already skip nulls; `gte('featuredRank', 0)` would be clearer.
  - Suggested change: normalize to `gte('featuredRank', 0)`; extract `featuredTemplateCardsQuery(ctx, { category? })`.

### 7T-18. `getMyShortLinks` filters expiry twice (index + JS)

- **File**: `convex/platform/shortLinks/queries.ts:84-92` and `convex/platform/shortLinks/listing.ts:21-23`
  - Issue: Query already restricts via the index, then `selectLiveOwnedShortLinks` re-filters in JS. JS filter is dead.
  - Suggested change: drop the JS filter, or document why both passes exist.

### 7T-19. `appendItemsToSeededTemplate` skips ownership and bounds checks

- **File**: `convex/marketplace/templates/seed.ts:1096-1149`
  - Issue: Looks up template by slug only. Doesn't verify `template.authorId === args.authorId`. Doesn't verify `args.startOrder >= 0`. Companion `finalizeSeededTemplateChunksImpl` (1158) DOES check authorId. Asymmetric defense.
  - Suggested change: add the `authorId` check; assert `args.startOrder >= 0` and `< MAX_TEMPLATE_ITEMS`.

### 7T-20. `finalizeSeededTemplateChunksImpl` trusts caller's `itemCount`

- **File**: `convex/marketplace/templates/seed.ts:1151-1204`
  - Issue: `itemCount: args.itemCount` written directly without recounting `templateItems` rows.
  - Suggested change: count rows under the slug; throw on mismatch.

### 7T-21. `cloudFields.ts` lacks an explicit return type

- **File**: `convex/workspace/boards/cloudFields.ts:4-10`
  - Suggested change: declare `(): Pick<Doc<'boards'>, 'cloudState' | 'materializationState' | 'cloudBackedAt' | 'pausedReason' | 'livePublicTemplateId'>`.

### 7T-22. Magic numbers that should live in `lib/limits.ts` (extends T21)

- `convex/marketplace/rankings/seed.ts:47-53` — multiple seed-only constants.
- `convex/marketplace/templates/seed.ts:678` — `RECOMPUTE_BATCH = 100`.
- `convex/marketplace/templates/seed.ts:819-820` — `WIPE_BATCH_TEMPLATES = 50`, `WIPE_BATCH_BOARDS = 50`.
- `convex/workspace/boards/queries.ts:29-31` — `MAX_BOARDS_PER_USER`, `MAX_DELETED_BOARDS_PER_USER`, `MAX_BOARD_STATE_BATCH`.
- `convex/workspace/tierPresets/queries.ts:12` — `MAX_PRESETS_PER_USER`.
- `convex/platform/shortLinks/internal.ts:17` — `SLUG_INSERT_MAX_ATTEMPTS`.
- `convex/platform/media/internal.ts:78,83,88` — `MAX_VARIANT_ROWS_PER_ASSET`, `GC_GRACE_MS`, `REFERENCE_CHECK_CONCURRENCY`.

### 7T-23. `wipeSeededDataBatchImpl` boards-phase termination is fragile (potential infinite loop)

- **File**: `convex/marketplace/templates/seed.ts:899-902,926`
  - Issue: Uses `.take(WIPE_BATCH_BOARDS)` then `isDone: page.length < WIPE_BATCH_BOARDS`. If exactly `WIPE_BATCH_BOARDS` boards still need wiping but they're all `sourceTemplateId === null` (filtered out at line 903), `forked` array is empty but `page.length === 50` so `isDone: false`. Next iteration takes the same 50 rows again (no cursor advancement) — **infinite loop**.
  - Suggested change: paginate with `.paginate({ cursor, numItems })` and use `page.isDone`.

### 7T-24. `revision: v.optional(v.number())` writer drift

- **File**: `convex/schema.ts:88`
  - Issue: Writers are inconsistent — most write `revision: 0`, but `marketplace/rankings/seed.ts:1022` writes `revision: 1`. The seed-script `revision: 1` is suspicious.
  - Suggested change: every writer should agree, or document semantics.

### 7T-25. `requireSeedAuthorByEmail` boilerplate repeated across 3 actions

- **File**: `convex/marketplace/templates/seed.ts:1235-1245, 1289-1299, 1327-1337`
  - Suggested change: hoist to `requireSeedAuthorByEmail` helper.

### 7T-26. `deleteSeedPair` redundant `if (board)` checks

- **File**: `convex/marketplace/rankings/seed.ts:832-833`
  - Suggested change: combine into one block; reuse parent `now`.

### 7T-27. `findUserByEmail` defensive return projection

- **File**: `convex/marketplace/templates/seed.ts:98-113`
  - Issue: Returns `{ _id, email: user.email ?? null }` — caller only needs `_id`. The `email` projection is dead.
  - Suggested change: drop `email` from validator and return type.

### 7T-28. `getMyLibraryBoards` joins user preferences inside the query (subscription amplification)

- **File**: `convex/workspace/boards/queries.ts:237-242`
  - Issue: Loads `userPreferences.byUser` for the calling user to pull `preferences.paletteId`. Subscribers re-run the query whenever `userPreferences.updatedAt` ticks (preference debounce flush) — even when palette didn't change.
  - Suggested change: project `defaultPaletteId` onto the user row directly, or use a denormalized table.

### 7T-29. `clearSeededTemplateCovers` fan-out (extends T18)

- **File**: `convex/marketplace/templates/seed.ts:782-814`
  - Issue: Even if paginated, `firstItemEntries` Promise.all then `patchTemplateAndSyncCard` Promise.all each spawn N concurrent reads/writes per page. With 100 templates per page, ~300 writes per page.
  - Suggested change: phase-split.

### 7T-30. Aspects checked and clean

- `convex/workspace/sync/loadBoundedBoardRows.ts` — solid, `.take(N+1)` overflow detection with structured `syncLimitExceeded` error.
- `convex/workspace/sync/boardStateLoader.ts` — clean.
- `convex/workspace/boards/internal.ts` (cascadeDeleteBoard) — phase / cursor / nextPhase logic correct.
- `convex/platform/preferences/{queries,mutations}.ts` — clean.
- `convex/platform/shortLinks/listing.ts` — pure helper.
- `convex/platform/media/internal.ts` — `finalizeVerifiedMediaAssets` uses `finalizedByHash` map for dedup correctly.
- All public functions in scope have `args:`, `returns:`, and `handler` signatures.

---

## 11.2. Efficiency — `src/features/` (top-up for §8)

### Summary

The most consequential newly found hot-path issues: **(1)** `useAnnotationCanvas` history-redraw effect runs a full O(n*strokes × n_points) `clearRect+redraw` of \_all* prior items on every committed stroke — even though incremental drawing in `pointerMove` already painted the stroke (UI freezes ~50ms+ at high stroke counts); **(2)** `BoardListSkeleton` and `BoardListTable` use **5 vs 6 column templates** (visual layout shift on data arrival); **(3)** `ImageEditorPane` calls `useImageUrl` _three times_ per pane — three useSyncExternalStore subscriptions per active item, plus two never-displayed cloud fetch effects when only one variant is rendered; **(4)** `usePaneLabelEditor` invalidates `labelLayout` and `previewLabelDisplay` per-render because `boardLabels` selector is from a 9-field useShallow that flips identity on every transform commit; **(5)** `MyListsPage` re-creates the `(b) => void openBoard.open(b)` lambda for both grid and list views breaking `BoardCard`/`BoardListRow` memo (different file:line from prior 8.13); **(6)** `ImageEditorRail` and `BoardListTable` are unvirtualized (200 DOM nodes per modal mount).

### 8T-1. Three concurrent `useImageUrl` subscriptions per active pane

- **File**: `src/features/workspace/imageEditor/ui/ImageEditorPane.tsx:131-137`
  - Issue: `useImageUrl(editorRefs[0]?.hash)`, `useImageUrl(editorRefs[1]?.hash)`, `useImageUrl(editorRefs[2]?.hash)` create three `useSyncExternalStore` subscriptions and three `requestCloudImage` effects. Only one URL is rendered.
  - Impact: medium.
  - Suggested change: subscribe eagerly only to refs[0]; fall through if primary is null. Fold into `useImageUrlChain([h0, h1, h2])`.

### 8T-2. `ImageEditorModal` 9-field `useShallow` projection

- **File**: `src/features/workspace/imageEditor/ui/ImageEditorModal.tsx:54-92`
  - Issue: Any `setItemTransform`/`setItemsTransform` writes a new `items` reference, busting useShallow's pointer comparison and re-running the projection (which itself runs `getBoardItemAspectRatio(s)` — O(tiers) inside).
  - Impact: medium — every transform commit (~every 350ms during draft auto-commit) re-projects all 9 fields.
  - Suggested change: split into 3 shallow subscriptions: (a) `(items, tiers, unrankedItemIds)`, (b) board-config primitives, (c) actions via stable getState reference.

### 8T-3. `usePaneLabelEditor` `labelLayout` cascades on every transform commit

- **File**: `src/features/workspace/imageEditor/model/usePaneLabelEditor.ts:68-76`
  - Issue: `globalLabelDefaults` from `ImageEditorModal.tsx:100-107` invalidates whenever any of (showLabels, placementMode, fontSizePx) flips. `boardLabels` invalidation via the modal's `useShallow` cascades.
  - Impact: medium.
  - Suggested change: pass primitive `globalShowLabels`, `globalPlacementMode`, `globalFontSizePx` and `boardLabels` flat.

### 8T-4. Per-row recomputation in `ImageEditorRail`

- **File**: `src/features/workspace/imageEditor/ui/ImageEditorRail.tsx:184-187` — `boundedAspectSize(boardAspectRatio, RAIL_THUMBNAIL_BOUND)` recomputed per row
  - Suggested change: hoist `thumbnailSize` to parent.

- **File**: `src/features/workspace/imageEditor/ui/ImageEditorRail.tsx:177-181` — `resolveLabelLayout` per rail row, every render
  - Issue: For 100+ image items, 100 calls + 100 allocations per render.
  - Suggested change: pass pre-resolved `labelHidden`/`hasLabelOverride` booleans, or compute resolved layout once.

### 8T-5. `MyListsPage` inline-lambda memo busting (extends prior 8.13)

- **File**: `src/features/library/pages/MyListsPage.tsx:262-263, 274-285`
  - Issue: Fresh inline closures **twice**: line 263 for `BoardListTable` and line 279 for grid map. `BoardCardImpl` and `BoardListRow` are explicitly `memo`'d. `useOpenLibraryBoard` deliberately stabilizes via `pendingRef`. `MyListsPage` re-wrappers undo all of that.
  - Impact: medium — every parent re-render re-renders every board card/row.
  - Suggested change: pass `openBoard.open` directly. Widen `BoardCard.onOpen` signature to `(board) => void`.

### 8T-6. Library list column-template mismatch (visual)

- **File**: `src/features/library/components/BoardListTable.tsx:107-135` vs `LibrarySkeleton.tsx:43-79` — 5 vs 6 columns
  - Issue: When data resolves and replaces the skeleton, columns shift. Layout reflow on data arrival.
  - Suggested change: extract single shared `LIBRARY_LIST_COLUMN_TEMPLATE`.

### 8T-7. `ItemPreviewModal` two `useImageUrl` subscriptions

- **File**: `src/features/workspace/preview/ui/ItemPreviewModal.tsx:30-43`
  - Issue: Same anti-pattern as ImageEditorPane. `getRenderImageRefs(item, 'editor')` called per render unconditionally (line 31).
  - Impact: low.
  - Suggested change: skip fallback when primary returns; memoize `refs`.

### 8T-8. `useAnnotationCanvas` history-redraw effect runs full canvas redraw on every commit

- **File**: `src/features/workspace/annotation/model/useAnnotationCanvas.ts:210-213`
  - Issue: File header (lines 207-209) acknowledges the design choice, but `redraw` clears the whole canvas and re-runs `drawAnnotationItem` for every item in history. Live drawing inside `handlePointerMove` (lines 244-252) already paints the stroke incrementally — but on `pointerup`, history changes and the effect re-clears and re-runs everything from scratch. **Each commit = one wasted clear + a full O(n_strokes × n_points) redraw.**
  - Impact: medium (UI freezes ~50ms+ at high stroke counts).
  - Suggested change: only call `redraw` from `undo`/`clearAll` paths. For commits, just append to history without the redraw effect. Track an explicit `needsFullRedraw` flag.

### 8T-9. `useImageEditorAutoCropAll` per-item single-element array allocations

- **File**: `src/features/workspace/imageEditor/model/useImageEditorAutoCropAll.ts:96-128`
  - Issue: For each item we instantiate a single-element array `[it]` AND walk into the cached-crops resolver. For 200 items, 200 single-item array allocations per call. Same pattern at line 85.
  - Impact: medium.
  - Suggested change: change `areCachedAutoCropsApplied` to accept single-item input, or memoize per-item results in `Map<ItemId, boolean>`.

### 8T-10. `fitBaseline` `useMemo` deps include whole `item` identity

- **File**: `src/features/workspace/imageEditor/model/useImageEditorTransformDraft.ts:60-63`
  - Issue: Using whole `item` identity rather than `(item.aspectRatio, item.id)` causes baseline to recompute on every parent items-map flip.
  - Impact: medium — every transform commit anywhere on the board triggers baseline recomputation in the active pane.
  - Suggested change: depend on `item.aspectRatio` only.

### 8T-11. Auxiliary stores lack same-reference no-op guards

- `useImageEditorStore.ts:33` — `close()` always replaces fields.
- `useImageEditorStore.ts:34` — `setFilter` no equality check.
- `useItemPreviewStore.ts:21` — `close()` same anti-pattern.
- `useAnnotationCanvas.ts:346-350` — `undo` slices empty array.
- `useAnnotationCanvas.ts:353-357` — `clearAll` always sets `setHistory([])`.
  - Suggested change: add `setIfChanged` helper or short-circuit each manually.

### 8T-12. `skippedIds` and annotation `history` can grow unbounded

- `useImageEditorSelection.ts:55-57` — `skippedIds` set bounded by item count (200), soft cap.
- `useAnnotationCanvas.ts:134` — `history` array no cap. Combined with 8T-8 redraw issue → O(n²) over time.
  - Suggested change: cap history length, or compose into single bitmap once strokes exceed N.

### 8T-13. `labelAppliedToAll` recomputed every render in modal

- **File**: `src/features/workspace/imageEditor/ui/ImageEditorModal.tsx:316-318`
  - Issue: `allImageItems.every((it) => isEmptyItemLabelOptions(it.labelOptions))` walks every image item. For 200 items, 200 calls per modal render.
  - Suggested change: `useMemo(() => allImageItems.every(...), [allImageItems])`.

### 8T-14. Three inline callbacks passed to `ImageEditorPane`

- **File**: `src/features/workspace/imageEditor/ui/ImageEditorModal.tsx:309-313`
  - Issue: `onCommit`, `onLabelChange`, `onLabelOptionsChange` each fresh closures per render. `useImperativeHandle` and `flushCommitRef` indirectly depend on `onCommit` identity.
  - Impact: medium.
  - Suggested change: hoist via `useCallback` keyed on `[selectedItem.id, ...store-actions]`.

### 8T-15. `compositeAndDownload` decodes background image twice

- **File**: `src/features/workspace/annotation/model/useAnnotationCanvas.ts:362-384`
  - Issue: Background image is _already loaded_ in the DOM. Save creates fresh `new Image()`; `img.src = backgroundImage` triggers another decode.
  - Impact: low-medium — save UX feels sluggish for large boards.
  - Suggested change: pass already-decoded `HTMLImageElement` ref from `AnnotationCanvas`.

### 8T-16. `filterImageEditorItems` and `filterLibraryBoards` always allocate even for `'all'`

- `useImageEditorItems.ts:60-69` — `[...items]` for `filter === 'all'` breaks referential equality.
- `library/lib/sortAndFilter.ts:28-31` — `rows.slice()` for `'all'`. Two copies on the happy path.
  - Suggested change: return input directly for `'all'`.

### 8T-17. `resolveLabelLayout` duplicated between `usePaneLabelEditor` and `ImageEditorRail`

- **File**: `usePaneLabelEditor.ts:68-76` and `ImageEditorRail.tsx:177-181` — both call `resolveLabelLayout` independently per render
  - Impact: medium for boards with many image items.
  - Suggested change: hoist `resolveLabelLayout` per item into a memoized map at the modal level.

### 8T-18. `loadImageEditorModal` chunk includes `~/shared/lib/autoCrop` (heavy canvas/imagedata code)

- **File**: `src/features/workspace/imageEditor/ui/loadImageEditorModal.ts:6-7`
  - Issue: Transitively brings in `~/shared/lib/autoCrop` carrying `detectContentBBox` even when the user never clicks Auto-crop.
  - Impact: low-medium — ~50KB gzip estimated.
  - Suggested change: split `~/shared/lib/autoCrop` so detection algorithm loads only when user clicks Auto-crop.

### 8T-19. `ImageEditorRail` and `BoardListTable` unvirtualized

- **File**: `ImageEditorRail.tsx:128-145` — for 200 image items, every row renders unconditionally. 200 DOM nodes + 200 `<img>` elements per modal mount.
  - Suggested change: virtualize via react-window or IntersectionObserver.

- **File**: `BoardListTable.tsx:126-134` and `MyListsPage.tsx:267-286` — also unvirtualized.
  - Suggested change: at minimum add intersection-based image lazy-load for cover mosaic.

### 8T-20. `DraggableLabelOverlay` `onPointerMove` no rAF throttle, `setPlacementDraftState` no bail

- **File**: `src/features/workspace/imageEditor/ui/DraggableLabelOverlay.tsx:77-118`
  - Issue: Pointer-move fires at native frequency (often 100-120Hz on trackpads). Each call triggers two store-state updates. `usePaneLabelEditor.ts:139-155` always sets new state object even when x/y haven't moved. Canonical "render-thrash on drag" path.
  - Impact: medium — drag latency could be measurably reduced.
  - Suggested change: rAF-throttle `handleLabelDragMove`, or bail when `prev.draft.x === nextDraft.x && prev.draft.y === nextDraft.y`.

### 8T-21. `useMeasuredElementSize` re-installs ResizeObserver on aspect-ratio changes

- **File**: `src/features/workspace/imageEditor/lib/useMeasuredElementSize.ts:24-51`
  - Issue: Callers like `ImageEditorPane.tsx:170-173` pass `{ width: previewW, height: previewH }` as fallback. Values shift on every aspect-ratio chip click.
  - Suggested change: stash fallback in a ref; only depend on `[ref]`.

### 8T-22. `imgStyle` rebuilt every render in `ImageEditorPane`

- **File**: `src/features/workspace/imageEditor/ui/ImageEditorPane.tsx:444-456`
  - Issue: `buildManualCropImgStyle(working, ...)` returns fresh style object on every render. Already on hot path during drag.
  - Suggested change: `useMemo` keyed on `[working, item.aspectRatio, frameAspectRatio, useManualCrop]`.

### 8T-23. `ItemPreviewModal` selector returns whole item

- **File**: `src/features/workspace/preview/ui/ItemPreviewModal.tsx:25`
  - Issue: Lightbox only displays `altText`, `label`, `imageRefs`, `transform`-presence — but re-renders on any mutation to that item.
  - Suggested change: `useShallow` over only displayed fields.

### 8T-24. Other low-impact items

- `usePaneLabelEditor.ts:80-91` — dual draft-state reconciliation. Deliberate "conflict-aware" pattern. Leave.
- `AnnotationCanvas.tsx:40-43` — `requestAnimationFrame(() => inputRef.current?.focus())` no cleanup. Trivial.
- `ImageEditorModal.tsx:300` — `key=...` forces full pane remount on ratio toggle. Intentional design.
- `EmbedView.tsx:52-76` — `setData(normalizeBoardSnapshot(result, ...))` synchronous before paint. Low (embeds small).

---

## 11.3. Efficiency — `src/shared/` + `src/app/` (top-up for §9)

### Summary

Biggest net-new findings: **(1)** `useAboveBreakpoint` re-subscribes the `MediaQueryList.change` listener on every render — subscribe lambda freshly allocated per render. **(2)** `selectBoardDataFields` allocates a fresh 13-field object on every store dispatch in the autosave subscribe path. **(3)** `replaceBlobRefs` opens two sequential IDB transactions; `pruneUnreferencedBlobs` opens one transaction per stale hash. **(4)** `scopeOwnedSyncMeta` always allocates even when no scoping change. **(5)** `sha256HexFromBlob` reads multi-MB blobs into RAM with no streaming. **(6)** `buildItemRenditionRecords` Promise.alls are sequential rather than pipelined for encode → hash. **(7)** `useInlineEdit.getInputProps` rebuilds 3 inline arrows per keystroke. **(8)** `LiveRegion` refcount race silences screen reader on route transitions.

### 9T-1. `useAboveBreakpoint` re-subscribes on every render

- **File**: `src/shared/hooks/useViewportWidth.ts:46-51`
  - Issue: The subscribe arrow `(onStoreChange) => subscribeToBreakpoint(breakpoint, onStoreChange)` is freshly allocated on every parent render. `useSyncExternalStore` only re-subscribes when subscribe identity changes — and here it always does. Each render of `WorkspaceShell` (mounted at all times) tears down + re-adds a `MediaQueryList.change` listener.
  - Impact: medium — `WorkspaceShell` re-renders are common; `change` listener churns hundreds of times per session.
  - Suggested change: hoist `subscribeToBreakpoint640` etc. to a stable module-scope reference, or `useMemo` the subscribe per breakpoint.

### 9T-2. `selectBoardDataFields` allocates a fresh 13-field object on every store dispatch

- **File**: `src/shared/board-data/boardSnapshot.ts:243-275`
  - Issue: Subscribed via `useActiveBoardStore.subscribe(selectBoardDataFields, …, { equalityFn: boardDataFieldsEqual })`. Zustand calls `selectBoardDataFields(state)` on every action — keystrokes, drags, tier-color tweaks. Each call allocates a 13-property object that's then equality-checked.
  - Impact: medium — fires per state action (potentially hundreds/sec during drag).
  - Suggested change: write a custom subscribe equality that compares the 13 store keys directly without ever materializing the projection: `(a, b) => BOARD_DATA_SELECTION_KEYS.every(k => a[k] === b[k])`.

### 9T-3. `normalizeBoardSnapshot` is non-idempotent

- **File**: `src/shared/board-data/boardSnapshot.ts:312-352`
  - Issue: `extractBoardData:277-293` and `resetBoardData:295-310` both build new objects. `normalizeBoardSnapshot` always allocates fresh `tiers`, `items`, `unrankedItemIds` even when input shape already matches expected output.
  - Impact: medium — runs on every persisted-state hydration, embed mount, etc.
  - Suggested change: short-circuit when value is already normalized; reuse identical sub-objects.

### 9T-4. `useInlineEdit.getInputProps` allocates 3 inline arrows per keystroke

- **File**: `src/shared/hooks/useInlineEdit.ts:137-173`
  - Issue: `useCallback` deps are `[editValue, handleBlur, handleKeyDown]` and `editValue` changes on every keystroke. Returns object with three fresh function refs per call.
  - Suggested change: split into `useStableInputHandlers` (no `editValue` dep) returning the 3 handlers, plus a separate value.

### 9T-5. `validateItemEntry` recomputes type guards 3-4× per item

- **File**: `src/shared/board-data/boardJson.ts:97-126`
  - Issue: For each item: `isHashedRef(value)` (3 calls) + `isNonEmptyString` × 3 + `itemUsesLocalImageRef(item)` runs `isTierItemImageRef` 3× more on the **same** three refs. ~10+ guard calls per item.
  - Impact: low–medium — multi-board imports of 200+ items spend dozens of ms.
  - Suggested change: read refs once via `const refs = pickRefs(item)`; check guard once.

### 9T-6. Other allocation hot spots

- **File**: `src/shared/board-data/boardJson.ts:163-187` — two-pass validation walking `allReferencedIds` twice. Combine into single loop.
- **File**: `src/shared/board-data/boardWireMapper.ts:50-76` — `isTierItemWire` 5 typeof checks per item. Short-circuit chain.
- **File**: `src/shared/board-data/boardWireMapper.ts:171-181` — three Maps (`hashes`, `records`, `blobsByHash`) sequentially with overlapping work. Drop the third Map.
- **File**: `src/shared/sharing/hashShare.ts:36-62` — `stripImagesForShare` calls `hasAnyImageRef` then destructures all three image-ref fields anyway. Combine.

### 9T-7. `scopeOwnedSyncMeta` and `markOwnedSyncSynced` always allocate

- **File**: `src/shared/lib/sync/ownedSyncMeta.ts:43-61, 79-88`
  - Issue: `scopeOwnedSyncMeta` returns `{ ...meta, ownerUserId }` even when `meta.ownerUserId === ownerUserId`. `markOwnedSyncSynced` always allocates.
  - Suggested change: short-circuit when already-scoped; for `markOwnedSyncSynced`, bail when all three relevant fields match.

### 9T-8. URL filter canonicalize-effect re-parses + re-writes

- **File**: `src/shared/catalog/urlFilters.ts:117-124`
  - Issue: `useEffect` runs `create(params, {})` (full parse) then `write(next, parsed)` (full write) just to compute canonical form. Runs once per URL change.
  - Suggested change: cache `next.toString()` in a ref; or expose `isCanonical(params)` predicate.

- **File**: `src/shared/catalog/urlFilters.ts:103-113` — `commitFilters` deps include `params` and `paramsKey` (lockstep).
  - Suggested change: drop `params` from deps.

### 9T-9. `dismissalTimers` and `cloudBatchFetcher` registration leaks

- **File**: `src/shared/notifications/useToastStore.ts:29` — `dismissalTimers` Map never cleared on test isolation.
  - Suggested change: expose `clearAllToasts()`.

- **File**: `src/shared/images/imageBlobCache.ts:35` — `failedCloudRequests` race window: `markCloudRequestsFailed` doesn't filter by `inFlightByHash.has`.
  - Suggested change: add `if (inFlightByHash.has(request.hash)) continue` in `markCloudRequestsFailed:144-150`.

- **File**: `src/shared/images/imageBlobCache.ts:24` — `cloudBatchFetcher` stays registered after sign-out. When user signs back in **as a different user**, the closed-over `useAuthSession` from the previous registration continues to be used. The "ignored second registration" rule actively blocks recovery.
  - Impact: medium for multi-account workflows.
  - Suggested change: replace with "always-latest" ref, or expose `unregisterCloudImageFetcher` and have `useCloudSync` install/uninstall on user-id change.

### 9T-10. `sha256HexFromBlob` pulls full blob into RAM before hashing

- **File**: `src/shared/lib/sha256.ts` (referenced by `prepareDataUrlRecord`/`prepareBlobRecord`)
  - Issue: Reads entire blob via `arrayBuffer()` synchronously then hashes. For multi-MB source renditions, three blobs get fully materialized in JS RAM at once via `Promise.all`.
  - Impact: medium for users uploading 5+ MB sources.
  - Suggested change: chunked hashing via `Crypto.subtle.digest` + `ReadableStream`.

### 9T-11. `inflateSnapshotBytes` decodes JSON synchronously

- **File**: `src/shared/sharing/hashShare.ts:91-132`
  - Issue: `new TextDecoder().decode(bytes)` + `parseBoardSnapshotJson(json)` run synchronously after pako finishes. JSON parse for 256KB compressed = up to 16MB inflated → main-thread block.
  - Impact: medium — share-link decode on first load.
  - Suggested change: yield to event loop with `await Promise.resolve()` between inflate and parse; long-term Worker.

### 9T-12. `parseBoardsJson` does sequential `await parseBoardData` per board

- **File**: `src/shared/board-data/boardJson.ts:209-258`
  - Suggested change: `Promise.all` bound-limited to 2-3 in-flight to avoid IDB tx contention.

### 9T-13. `compressShortLinkSnapshotBytes` loads blobs even if size will be rejected

- **File**: `src/shared/sharing/shortLinkCodec.ts:24-32`
  - Issue: `snapshotToWire` loads blobs for live items via `getBlobsBatch` — even though `assertShortLinkSnapshotSize` may reject. For a board with 200 large items, you load every blob and encode every data URL only to fail size check.
  - Impact: medium — short-link generation on big boards is multi-second.
  - Suggested change: pre-flight estimated upper-bound on snapshot size before doing IDB reads.

### 9T-14. `replaceBlobRefs` opens 2 sequential IDB transactions

- **File**: `src/shared/images/imageStore.ts:393-422`
  - Issue: `deleteTx` then `putTx` for the same store. Sequential transactions wait for first to commit, doubling latency.
  - Impact: medium for board switches.
  - Suggested change: combine into a single `readwrite` transaction.

### 9T-15. `pruneUnreferencedBlobs` opens one transaction per stale hash

- **File**: `src/shared/images/imageStore.ts:547-558`
  - Issue: Loop opens N transactions sequentially. For 100 stale hashes, 100 tx commits.
  - Impact: medium during GC sweeps.
  - Suggested change: open one `readwrite` transaction across both stores; do all deletes inside.

### 9T-16. `prepareItemRenditions` Promise.alls are sequential rather than pipelined

- **File**: `src/shared/images/prepareItemRenditions.ts:64-71, 73-77`
  - Issue: First Promise.all does 3× `canvasToBlob`; second does 3× `prepareBlobRecord` (which hashes). Sequential — chained. Could pipeline: as soon as one canvas finishes encoding, hashing can start.
  - Impact: medium — typical upload spends ~300ms here.
  - Suggested change: `Promise.all([...].map(async (cv) => prepareBlobRecord(await canvasToBlob(cv, opts))))`.

### 9T-17. `LiveRegion` refcount race silences screen reader on route transitions

- **File**: `src/shared/a11y/LiveRegion.tsx:32-43`
  - Issue: When LiveRegion mounts twice across a route transition (`MarketplaceLayout` mounts one, the next route mounts another before unmount), the second `registerAnnouncer` overwrites the first; the first's cleanup then calls `registerAnnouncer(null)`, **clearing the second's announcer** until re-registration.
  - Impact: medium — silent screen reader for ~16ms on every route change.
  - Suggested change: refcount approach — track stack of announcers, keep top-of-stack active. Or restrict to single LiveRegion mounted in `AppChromeLayout`.

### 9T-18. `WorkspaceRoute` eager-imported

- **File**: `src/app/routes/AppRouter.tsx:14, 17`
  - Issue: For users who land on a marketplace URL, `WorkspaceRoute` (largest chunk) is not needed for first paint.
  - Impact: medium — wastes ~50-100KB on marketplace cold loads.
  - Suggested change: `lazy()` `WorkspaceRoute`.

### 9T-19. `imageBlobCache` `pruneCache` publish fan-out

- **File**: `src/shared/images/imageBlobCache.ts:223-248`
  - Issue: `publish(changed)` outside the `cache.delete` loop fires React `forceUpdate` on every consumer of every evicted hash. With LRU eviction during a board switch, can publish to dozens of subscribers in one shot.
  - Suggested change: batch via `queueMicrotask`.

### 9T-20. `getResizedDimensions` short-circuit only triggers when both edges are under maxSize

- **File**: `src/shared/images/imageEncode.ts:18-21`
  - Issue: For non-square images already under one cap but over the other, double-resamples in chained downscale.
  - Impact: low — extra ~10ms per portrait upload.
  - Suggested change: longer-edge cap consistently; skip intermediate stage when input fits.

### 9T-21. `drawImageToCanvas` allocates new HTMLCanvasElement per call; high quality always

- **File**: `src/shared/images/imageEncode.ts:40-66`
  - Issue: Three `drawImageToCanvas` calls allocate three canvases per upload. `imageSmoothingQuality = 'high'` for 120px preview thumb is overkill; `'medium'` indistinguishable.
  - Suggested change: maintain tiny canvas pool; parameterize quality per stage.

### 9T-22. `useRovingSelection.getItemProps` rebuilds when `items` ref changes

- **File**: `src/shared/selection/useRovingSelection.ts:103-154`
  - Issue: If caller doesn't memoize `items`, `getItemProps` rebuilds per render. Each invocation returns fresh object with 7 keys; for 30-item picker grids, 30 fresh objects per render.
  - Suggested change: drop `items` from `getItemProps` deps (read via ref pattern); only `index` parameter matters per call.

- **File**: `src/shared/selection/useRovingSelection.ts:110-114` — ref-callback recreated per call. React calls it twice per change.
  - Suggested change: `useMemo` ref-callbacks per `key` via `Map<K, (node) => void>`.

### 9T-23. `pathname.ts` re-string-concats per call

- **File**: `src/shared/routes/pathname.ts:10-20, 28-32, 37-41`
  - Issue: `normalizeBasePath` reads `import.meta.env.BASE_URL` per call (build-time constant); `getTemplatesPath`, `getRankingsPath` re-string-concat per call.
  - Suggested change: precompute `BASE_PATH` and `TEMPLATES_BASE`/`RANKINGS_BASE` at module load.

### 9T-24. `formatCount` regex per call for ≥1000

- **File**: `src/shared/catalog/formatters.ts:7-15`
  - Issue: For ≥1000, `(n / 1_000).toFixed(1).replace(/\.0$/, '')` runs a regex per call. Hot in TemplateCard / RankingCard.
  - Suggested change: cache common values, or use `Intl.NumberFormat` with `notation: 'compact'`.

### 9T-25. ToastStore allocations on first-toast and unknown-id removal

- `useToastStore.ts:46-64` — allocates fresh empty array slice in "first toast" path. Short-circuit when length is 0.
- `useToastStore.ts:79-82` — `removeToast` always replaces array. Bail when filter doesn't change length.

### 9T-26. `FramedItemMedia` initial layout-forcing read

- **File**: `src/shared/board-ui/FramedItemMedia.tsx:64-87`
  - Issue: Initial `update()` synchronously invokes `getBoundingClientRect`. With 100 manually-cropped tiles, 100 forced layouts per board mount.
  - Suggested change: defer initial `update()` to `requestAnimationFrame`.

### 9T-27. Other low-impact items

- `StaticBoard.tsx:88, 89-91, 96-167` — `TEXT_STYLES` lookup, style object, full `data.tiers.map` rebuild per render. Sub-component memoization recommended.
- `labelBlocks.tsx:65-74, 96-110` — inline `style` objects per render.
- `imageBlobCache.ts:363-367` — `pagehide` & `online` listeners installed unconditionally at module init; can never be removed for tests.
- `proceedGuard.ts:5-8` — wraps a one-line guard called 11+ times. Export singleton `ALWAYS_PROCEED`.

### 9T-28. Hooks audited as correctly-written (no findings)

- `src/shared/hooks/useImageUrl.ts` — clean.
- `src/shared/hooks/useClipboardCopy.ts` — clean.
- `src/shared/hooks/useConfirmationGate.ts` — clean.
- `src/shared/hooks/useAbortControllerHandle.ts` — clean.
- `src/shared/hooks/usePointInTimeQuery.ts` — clean.
- `src/shared/lib/sync/backoff.ts` — clean.
- `src/shared/selection/{selectionState,selectionNavigation}.ts` — pure helpers.
- `src/shared/board-ui/{boardTestIds,wrappedItemsGrid,BoardPrimitives,ItemOverlayButton,labelDisplay,initialsCode,constants,labelOverrides,labelSettings,PresetPreviewPills}.{ts,tsx}` — clean.
- `src/shared/board-data/{boardDefaults,boardNormalizers}.ts` — clean.
- `src/shared/sharing/shortLinkCodec.ts` — pre-flight pattern noted but core logic clean.

---

## 12. Combined top-priority action list (after both passes)

This section is retained as the synthesis point for the original review, but implementation order now lives in §1A. Use the phase plan instead of treating this as a separate competing backlog.

Highest-leverage findings by phase:

- **Phase 1**: `T12`, `T13`, `T18`, backend `T19`, `T20`, `T21`, and low-risk §7T seed/cron cleanup.
- **Phase 2**: `T1`, `T2`, `T3`, `T4`, `T6`, `T11`, and the small shared primitive/dedup work from §2-§3.
- **Phase 3**: `T5`, shared ownership cleanup, marketplace component grouping, and other large-directory organization.
- **Phase 4**: frontend quality/readability findings from §5-§6.
- **Phase 5**: `T8`, `T9`, render/subscription hot paths, image-editor/annotation interaction performance, and shared listener churn.
- **Phase 6**: `T10`, `T14`, browser data-pipeline CPU, image/cache memory, IDB, and share/import/export scaling.
- **Phase 7**: `T15`, `T16`, `T17`, aggregate job resilience, gallery query splitting, backend subscription amplification, and marketplace scaling architecture.
- **Phase 8**: remaining low-impact cleanup, dead-code audit closure, docs, tests, and accepted-tradeoff notes.
