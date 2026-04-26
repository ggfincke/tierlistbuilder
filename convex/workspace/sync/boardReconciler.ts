// convex/workspace/sync/boardReconciler.ts
// pure server-side row-diff helpers for upsertBoardState reconciliation

import type { Doc, Id } from '../../_generated/dataModel'
import type {
  CloudBoardItemWire as WireItem,
  CloudBoardTierWire as WireTier,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import type { ItemTransform } from '@tierlistbuilder/contracts/workspace/board'

export interface TierDiff
{
  insert: Array<{
    externalId: string
    name: string
    description?: string
    colorSpec: Doc<'boardTiers'>['colorSpec']
    rowColorSpec?: Doc<'boardTiers'>['colorSpec']
    order: number
  }>
  patch: Array<{
    id: Id<'boardTiers'>
    fields: Partial<
      Omit<Doc<'boardTiers'>, '_id' | '_creationTime' | 'boardId'>
    >
  }>
  remove: Set<Id<'boardTiers'>>
}

export interface ItemDiff
{
  insert: Array<{
    externalId: string
    tierId: Id<'boardTiers'> | null
    label?: string
    backgroundColor?: string
    altText?: string
    mediaAssetId: Id<'mediaAssets'> | null
    sourceMediaAssetId: Id<'mediaAssets'> | null
    order: number
    deletedAt: number | null
    aspectRatio?: number
    imageFit?: 'cover' | 'contain'
    transform?: ItemTransform
  }>
  patch: Array<{
    id: Id<'boardItems'>
    fields: Partial<
      Omit<Doc<'boardItems'>, '_id' | '_creationTime' | 'boardId'>
    >
  }>
  softDelete: Array<{
    id: Id<'boardItems'>
    deletedAt: number
  }>
}

const hasOwnKey = (obj: object): boolean => Object.keys(obj).length > 0

// shallow structural compare — transforms are flat 4-field POJOs so a manual
// compare is cheaper & clearer than JSON.stringify
const transformsEqual = (
  a: ItemTransform | undefined,
  b: ItemTransform | undefined
): boolean =>
{
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.rotation === b.rotation &&
    a.zoom === b.zoom &&
    a.offsetX === b.offsetX &&
    a.offsetY === b.offsetY
  )
}

type WireMediaField = 'mediaExternalId' | 'sourceMediaExternalId'
type ServerMediaField = 'mediaAssetId' | 'sourceMediaAssetId'

interface ResolvedMediaField
{
  has: boolean
  resolved: Id<'mediaAssets'> | null
}

const resolveMediaField = (
  wire: WireItem,
  server: Doc<'boardItems'> | undefined,
  wireField: WireMediaField,
  serverField: ServerMediaField,
  mediaExternalIdToId: Map<string, Id<'mediaAssets'>>
): ResolvedMediaField =>
{
  const has = Object.hasOwn(wire, wireField)
  const externalId = wire[wireField]
  const resolved = !has
    ? (server?.[serverField] ?? null)
    : externalId
      ? (mediaExternalIdToId.get(externalId) ?? null)
      : null

  return { has, resolved }
}

export const diffTiers = (
  wireTiers: WireTier[],
  serverTiers: Doc<'boardTiers'>[]
): TierDiff =>
{
  const serverByExternalId = new Map(serverTiers.map((t) => [t.externalId, t]))
  const diff: TierDiff = { insert: [], patch: [], remove: new Set() }

  for (let i = 0; i < wireTiers.length; i++)
  {
    const wire = wireTiers[i]
    const server = serverByExternalId.get(wire.externalId)

    if (!server)
    {
      diff.insert.push({
        externalId: wire.externalId,
        name: wire.name,
        description: wire.description,
        colorSpec: wire.colorSpec,
        rowColorSpec: wire.rowColorSpec,
        order: i,
      })
      continue
    }

    serverByExternalId.delete(wire.externalId)

    const fields: TierDiff['patch'][number]['fields'] = {}
    if (server.name !== wire.name) fields.name = wire.name
    if (server.order !== i) fields.order = i

    const descChanged =
      (wire.description ?? undefined) !== (server.description ?? undefined)
    if (descChanged) fields.description = wire.description

    if (JSON.stringify(server.colorSpec) !== JSON.stringify(wire.colorSpec))
    {
      fields.colorSpec = wire.colorSpec
    }

    const wireRow = wire.rowColorSpec ?? undefined
    const serverRow = server.rowColorSpec ?? undefined
    if (JSON.stringify(wireRow) !== JSON.stringify(serverRow))
    {
      fields.rowColorSpec = wire.rowColorSpec
    }

    if (hasOwnKey(fields))
    {
      diff.patch.push({ id: server._id, fields })
    }
  }

  for (const leftover of serverByExternalId.values())
  {
    diff.remove.add(leftover._id)
  }

  return diff
}

// diff client items against existing server item rows. resolves tier
// externalIds to server IDs via the provided mapping & resolves media
// externalIds to mediaAsset IDs via the media map
export const diffItems = (
  wireItems: WireItem[],
  serverItems: Doc<'boardItems'>[],
  tierExternalIdToId: Map<string, Id<'boardTiers'>>,
  mediaExternalIdToId: Map<string, Id<'mediaAssets'>>,
  deletedItemExternalIds: ReadonlySet<string>
): ItemDiff =>
{
  const serverByExternalId = new Map(
    serverItems.map((item) => [item.externalId, item])
  )
  const diff: ItemDiff = { insert: [], patch: [], softDelete: [] }
  const now = Date.now()
  const seenExternalIds = new Set<string>()

  for (const wire of wireItems)
  {
    seenExternalIds.add(wire.externalId)
    const server = serverByExternalId.get(wire.externalId)
    const displayMedia = resolveMediaField(
      wire,
      server,
      'mediaExternalId',
      'mediaAssetId',
      mediaExternalIdToId
    )
    const sourceMedia = resolveMediaField(
      wire,
      server,
      'sourceMediaExternalId',
      'sourceMediaAssetId',
      mediaExternalIdToId
    )
    const isDeleted = deletedItemExternalIds.has(wire.externalId)
    const resolvedTierId = wire.tierId
      ? (tierExternalIdToId.get(wire.tierId) ?? null)
      : null

    if (!server)
    {
      diff.insert.push({
        externalId: wire.externalId,
        tierId: resolvedTierId,
        label: wire.label,
        backgroundColor: wire.backgroundColor,
        altText: wire.altText,
        mediaAssetId: displayMedia.resolved,
        sourceMediaAssetId: sourceMedia.resolved,
        order: wire.order,
        deletedAt: isDeleted ? now : null,
        aspectRatio: wire.aspectRatio,
        imageFit: wire.imageFit,
        transform: wire.transform,
      })
      continue
    }

    if (isDeleted && server.deletedAt === null)
    {
      diff.softDelete.push({ id: server._id, deletedAt: now })
      continue
    }

    if (!isDeleted && server.deletedAt !== null)
    {
      diff.patch.push({
        id: server._id,
        fields: {
          deletedAt: null,
          tierId: resolvedTierId,
          order: wire.order,
          label: wire.label,
          backgroundColor: wire.backgroundColor,
          altText: wire.altText,
          aspectRatio: wire.aspectRatio,
          imageFit: wire.imageFit,
          transform: wire.transform,
          ...(displayMedia.has ? { mediaAssetId: displayMedia.resolved } : {}),
          ...(sourceMedia.has
            ? { sourceMediaAssetId: sourceMedia.resolved }
            : {}),
        },
      })
      continue
    }

    const fields: ItemDiff['patch'][number]['fields'] = {}
    if (server.tierId !== resolvedTierId) fields.tierId = resolvedTierId
    if (server.order !== wire.order) fields.order = wire.order
    if (server.label !== wire.label) fields.label = wire.label
    if (server.backgroundColor !== wire.backgroundColor)
    {
      fields.backgroundColor = wire.backgroundColor
    }
    if (server.altText !== wire.altText) fields.altText = wire.altText
    if (server.aspectRatio !== wire.aspectRatio)
    {
      fields.aspectRatio = wire.aspectRatio
    }
    if (server.imageFit !== wire.imageFit) fields.imageFit = wire.imageFit
    if (!transformsEqual(server.transform, wire.transform))
    {
      fields.transform = wire.transform
    }
    if (displayMedia.has && server.mediaAssetId !== displayMedia.resolved)
    {
      fields.mediaAssetId = displayMedia.resolved
    }
    if (sourceMedia.has && server.sourceMediaAssetId !== sourceMedia.resolved)
    {
      fields.sourceMediaAssetId = sourceMedia.resolved
    }

    if (hasOwnKey(fields))
    {
      diff.patch.push({ id: server._id, fields })
    }
  }

  for (const [externalId, server] of serverByExternalId)
  {
    if (!seenExternalIds.has(externalId) && server.deletedAt === null)
    {
      diff.softDelete.push({ id: server._id, deletedAt: now })
    }
  }

  return diff
}
