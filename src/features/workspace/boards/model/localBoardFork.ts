// src/features/workspace/boards/model/localBoardFork.ts
// builds a local BoardSnapshot from a marketplace template or ranking &
// registers it as the active board — drives the signed-out fork/remix path

import {
  asBoardId,
  generateBoardId,
  generateItemId,
  generateTierId,
  type BoardId,
  type ItemId,
} from '@tierlistbuilder/contracts/lib/ids'
import {
  normalizeBoardTitle,
  type BoardSnapshot,
  type Tier,
  type TierItem,
  type TierItemImageRef,
} from '@tierlistbuilder/contracts/workspace/board'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import type {
  MarketplaceTemplateDetail,
  MarketplaceTemplateItem,
  TemplateMediaRef,
} from '@tierlistbuilder/contracts/marketplace/template'
import type {
  MarketplaceRankingDetail,
  MarketplaceRankingItem,
  MarketplaceRankingTier,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import { saveBoardToStorage } from '~/features/workspace/boards/data/local/boardStorage'
import {
  EMPTY_BOARD_SYNC_STATE,
  markBoardPendingSync,
  type BoardSyncState,
} from '~/features/workspace/boards/model/sync'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import {
  loadBoardState,
  saveActiveBoardSnapshot,
} from '~/features/workspace/boards/model/session/boardSessionPersistence'
import { warmFromBoard } from '~/shared/images/imageBlobCache'

// share-mode fallback tier presets when neither a template nor a ranking
// supplied any. mirrors `DEFAULT_TEMPLATE_TIERS` from convex/marketplace/templates/lib
// but stays client-side so signed-out forks don't reach the server for shapes
const DEFAULT_FORK_TIERS: ReadonlyArray<TierPresetTier> = [
  { name: 'S', colorSpec: { kind: 'palette', index: 0 } },
  { name: 'A', colorSpec: { kind: 'palette', index: 1 } },
  { name: 'B', colorSpec: { kind: 'palette', index: 2 } },
  { name: 'C', colorSpec: { kind: 'palette', index: 3 } },
  { name: 'D', colorSpec: { kind: 'palette', index: 4 } },
  { name: 'E', colorSpec: { kind: 'palette', index: 5 } },
]

// convert a marketplace media ref into the local image-ref shape. content
// hash + externalId let the image cache lazy-load bytes via the existing
// cloud-resolution path (works for signed-out viewers — URLs are publicly signed)
const mediaToImageRef = (
  media: TemplateMediaRef | null
): TierItemImageRef | undefined =>
  media
    ? {
        hash: media.contentHash,
        cloudMediaExternalId: media.externalId,
        cloudMediaOwnership: 'source',
      }
    : undefined

interface LocalForkOptions
{
  // when set, the new board is queued for sync as soon as the workspace sync
  // subscriber picks it up. signed-out callers pass false; signed-in callers
  // pass true so the upsert (& first-sync fork-counter tick) fires promptly
  markPendingSync: boolean
}

// shared finishing logic — persist the snapshot, register in the workspace
// board store, activate the board, & warm image refs so the editor renders
// without a flash
const finalizeLocalBoard = async (
  boardId: BoardId,
  snapshot: BoardSnapshot,
  { markPendingSync }: LocalForkOptions
): Promise<void> =>
{
  const syncState: BoardSyncState = markPendingSync
    ? markBoardPendingSync(EMPTY_BOARD_SYNC_STATE)
    : EMPTY_BOARD_SYNC_STATE

  const saveResult = saveBoardToStorage(boardId, snapshot, { syncState })
  if (!saveResult.ok)
  {
    throw new Error(
      `failed to persist locally-forked board ${boardId}: ${saveResult.message}`
    )
  }

  // mirror cloudBoardActivation's persist-then-swap sequence so a remount of
  // WorkspaceShell picks up the fresh board instead of the prior session
  useActiveBoardStore.getState().discardDragPreview()
  saveActiveBoardSnapshot()

  const registry = useWorkspaceBoardRegistryStore.getState()
  registry.addBoardMeta(
    { id: boardId, title: snapshot.title, createdAt: Date.now() },
    true
  )

  await warmFromBoard(snapshot, { includeCloud: true })
  loadBoardState(boardId, snapshot, syncState)
}

// build the unranked items collection from a flat marketplace items array.
// labels & images map directly; ids are fresh client-generated externalIds so
// the local board owns its identity & can resync later w/o id collisions
const buildItemsFromTemplateItems = (
  items: readonly MarketplaceTemplateItem[]
): { items: Record<ItemId, TierItem>; orderedIds: ItemId[] } =>
{
  const result: Record<ItemId, TierItem> = {}
  const orderedIds: ItemId[] = []

  const sorted = [...items].sort((a, b) => a.order - b.order)
  for (const item of sorted)
  {
    const id = generateItemId()
    const imageRef = mediaToImageRef(item.media)
    result[id] = {
      id,
      sourceTemplateItemExternalId: item.externalId,
      ...(imageRef ? { imageRef, tileImageRef: imageRef } : {}),
      ...(item.label !== null && item.label !== undefined
        ? { label: item.label }
        : {}),
      ...(item.backgroundColor !== null && item.backgroundColor !== undefined
        ? { backgroundColor: item.backgroundColor }
        : {}),
      ...(item.altText !== null && item.altText !== undefined
        ? { altText: item.altText }
        : {}),
      ...(item.aspectRatio !== null && item.aspectRatio !== undefined
        ? { aspectRatio: item.aspectRatio }
        : {}),
      ...(item.imageFit !== null && item.imageFit !== undefined
        ? { imageFit: item.imageFit }
        : {}),
      ...(item.transform !== null && item.transform !== undefined
        ? { transform: item.transform }
        : {}),
    }
    orderedIds.push(id)
  }

  return { items: result, orderedIds }
}

// derive board tiers from the template's suggested set, falling back to the
// canonical S–E preset when the template author left tiers unset
const buildTiersFromTemplate = (
  template: MarketplaceTemplateDetail
): Tier[] =>
{
  const sourceTiers =
    template.suggestedTiers.length > 0
      ? template.suggestedTiers
      : DEFAULT_FORK_TIERS

  return sourceTiers.map(
    (tier): Tier => ({
      id: generateTierId(),
      name: tier.name,
      description: tier.description,
      colorSpec: tier.colorSpec,
      rowColorSpec: tier.rowColorSpec,
      itemIds: [],
    })
  )
}

interface CreateLocalBoardFromTemplateArgs
{
  template: MarketplaceTemplateDetail
  templateItems: readonly MarketplaceTemplateItem[]
  // user-overridable title; defaults to the template title when blank
  title?: string
  markPendingSync: boolean
  preferredCriterionExternalId?: string
}

// build a fresh local board snapshot from a marketplace template + its items.
// items land unranked; tiers seed from the template's suggested set. source
// identity records the public slug so first sync can resolve it (or degrade)
export const createLocalBoardFromTemplate = async (
  args: CreateLocalBoardFromTemplateArgs
): Promise<BoardId> =>
{
  const {
    template,
    templateItems,
    markPendingSync,
    preferredCriterionExternalId,
  } = args

  const boardExternalId = generateBoardId()
  const boardId = asBoardId(boardExternalId)
  const title = normalizeBoardTitle(args.title ?? template.title)
  const tiers = buildTiersFromTemplate(template)
  const { items, orderedIds } = buildItemsFromTemplateItems(templateItems)

  const snapshot: BoardSnapshot = {
    title,
    tiers,
    items,
    unrankedItemIds: orderedIds,
    deletedItems: [],
    ...(template.itemAspectRatio !== null
      ? { itemAspectRatio: template.itemAspectRatio }
      : {}),
    ...(template.defaultItemImageFit !== null
      ? { defaultItemImageFit: template.defaultItemImageFit }
      : {}),
    ...(template.labels !== null ? { labels: template.labels } : {}),
    sourceTemplateId: template.slug,
    sourceTemplateTitle: template.title,
    ...(template.coverMedia
      ? { sourceTemplateCoverMedia: template.coverMedia }
      : {}),
    sourceTemplateCoverFraming: template.coverFraming,
    ...(preferredCriterionExternalId ? { preferredCriterionExternalId } : {}),
  }

  await finalizeLocalBoard(boardId, snapshot, { markPendingSync })
  return boardId
}

// build the items collection from a ranking + its source template item set.
// placed ranking items land in their author-chosen tier; template items the
// ranking author didn't place land unranked so the remixer sees the full surface
const buildItemsFromRanking = (
  rankingItems: readonly MarketplaceRankingItem[],
  templateItems: readonly MarketplaceTemplateItem[],
  tiersByExternalId: Map<string, Tier>
): { items: Record<ItemId, TierItem>; unrankedItemIds: ItemId[] } =>
{
  const result: Record<ItemId, TierItem> = {}
  const unrankedItemIds: ItemId[] = []
  const placedTemplateItemExternalIds = new Set<string>()

  const sortedRankingItems = [...rankingItems].sort((a, b) => a.order - b.order)
  for (const item of sortedRankingItems)
  {
    const id = generateItemId()
    const imageRef = mediaToImageRef(item.media)
    result[id] = {
      id,
      sourceTemplateItemExternalId: item.templateItemExternalId,
      ...(imageRef ? { imageRef, tileImageRef: imageRef } : {}),
      ...(item.label !== null && item.label !== undefined
        ? { label: item.label }
        : {}),
      ...(item.backgroundColor !== null && item.backgroundColor !== undefined
        ? { backgroundColor: item.backgroundColor }
        : {}),
      ...(item.altText !== null && item.altText !== undefined
        ? { altText: item.altText }
        : {}),
      ...(item.aspectRatio !== null && item.aspectRatio !== undefined
        ? { aspectRatio: item.aspectRatio }
        : {}),
      ...(item.imageFit !== null && item.imageFit !== undefined
        ? { imageFit: item.imageFit }
        : {}),
      ...(item.transform !== null && item.transform !== undefined
        ? { transform: item.transform }
        : {}),
    }
    if (item.templateItemExternalId)
    {
      placedTemplateItemExternalIds.add(item.templateItemExternalId)
    }

    const tier = item.tierExternalId
      ? tiersByExternalId.get(item.tierExternalId)
      : undefined
    if (tier)
    {
      tier.itemIds.push(id)
    }
    else
    {
      unrankedItemIds.push(id)
    }
  }

  // template items the ranking author didn't place fall into the unranked tray
  // so the remixer can move them around — mirrors the server-side remix flow
  const sortedTemplateItems = [...templateItems].sort(
    (a, b) => a.order - b.order
  )
  for (const item of sortedTemplateItems)
  {
    if (placedTemplateItemExternalIds.has(item.externalId)) continue
    const id = generateItemId()
    const imageRef = mediaToImageRef(item.media)
    result[id] = {
      id,
      sourceTemplateItemExternalId: item.externalId,
      ...(imageRef ? { imageRef, tileImageRef: imageRef } : {}),
      ...(item.label !== null && item.label !== undefined
        ? { label: item.label }
        : {}),
      ...(item.backgroundColor !== null && item.backgroundColor !== undefined
        ? { backgroundColor: item.backgroundColor }
        : {}),
      ...(item.altText !== null && item.altText !== undefined
        ? { altText: item.altText }
        : {}),
      ...(item.aspectRatio !== null && item.aspectRatio !== undefined
        ? { aspectRatio: item.aspectRatio }
        : {}),
      ...(item.imageFit !== null && item.imageFit !== undefined
        ? { imageFit: item.imageFit }
        : {}),
      ...(item.transform !== null && item.transform !== undefined
        ? { transform: item.transform }
        : {}),
    }
    unrankedItemIds.push(id)
  }

  return { items: result, unrankedItemIds }
}

// derive board tiers from a ranking's tier set, preserving order. each tier
// gets a fresh client-side externalId; we keep a slug map so ranking items
// can resolve to the new ids when placing them in tiers
const buildTiersFromRanking = (
  rankingTiers: readonly MarketplaceRankingTier[]
): { tiers: Tier[]; tiersByExternalId: Map<string, Tier> } =>
{
  const tiersByExternalId = new Map<string, Tier>()
  const sorted = [...rankingTiers].sort((a, b) => a.order - b.order)
  const tiers = sorted.map((tier): Tier =>
  {
    const newTier: Tier = {
      id: generateTierId(),
      name: tier.name,
      description: tier.description ?? undefined,
      colorSpec: tier.colorSpec,
      rowColorSpec: tier.rowColorSpec ?? undefined,
      itemIds: [],
    }
    tiersByExternalId.set(tier.externalId, newTier)
    return newTier
  })
  return { tiers, tiersByExternalId }
}

interface CreateLocalBoardFromRankingArgs
{
  ranking: MarketplaceRankingDetail
  templateItems: readonly MarketplaceTemplateItem[]
  title?: string
  markPendingSync: boolean
}

// build a local board snapshot from a ranking + its source-template items.
// ranking items land in author-chosen tiers; template items the author didn't
// place land unranked. source records BOTH so first sync ticks both counters
export const createLocalBoardFromRanking = async (
  args: CreateLocalBoardFromRankingArgs
): Promise<BoardId> =>
{
  const { ranking, templateItems, markPendingSync } = args

  const boardExternalId = generateBoardId()
  const boardId = asBoardId(boardExternalId)
  const title = normalizeBoardTitle(args.title ?? ranking.title)
  const { tiers, tiersByExternalId } = buildTiersFromRanking(ranking.tiers)
  const { items, unrankedItemIds } = buildItemsFromRanking(
    ranking.items,
    templateItems,
    tiersByExternalId
  )

  const snapshot: BoardSnapshot = {
    title,
    tiers,
    items,
    unrankedItemIds,
    deletedItems: [],
    sourceTemplateId: ranking.template.slug,
    sourceRankingId: ranking.slug,
    sourceTemplateTitle: ranking.template.title,
    sourceRankingTitle: ranking.title,
    preferredCriterionExternalId: ranking.criterion.externalId,
  }

  await finalizeLocalBoard(boardId, snapshot, { markPendingSync })
  return boardId
}
