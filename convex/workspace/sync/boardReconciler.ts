// convex/workspace/sync/boardReconciler.ts
// pure server-side row-diff helpers for upsertBoardState reconciliation

import type { Doc, Id } from '../../_generated/dataModel'
import type {
  CloudBoardItemWire as WireItem,
  CloudBoardTierWire as WireTier,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import type {
  ItemLabelOptions,
  ItemTransform,
  MediaPlate,
} from '@tierlistbuilder/contracts/workspace/board'
import { itemLabelOptionsEqual } from '@tierlistbuilder/contracts/workspace/board'
import { isSameItemTransform } from '@tierlistbuilder/contracts/workspace/imageMath'
import { tierColorSpecEqual } from '@tierlistbuilder/contracts/lib/theme'

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
    mediaPlate?: MediaPlate
    altText?: string
    notes?: string
    mediaAssetId: Id<'mediaAssets'> | null
    order: number
    deletedAt: number | null
    aspectRatio?: number
    imageFit?: 'cover' | 'contain'
    transform?: ItemTransform
    imagePadding?: number
    labelOptions?: ItemLabelOptions
    templateItemId?: Id<'templateItems'>
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
    fields?: Partial<
      Omit<Doc<'boardItems'>, '_id' | '_creationTime' | 'boardId'>
    >
  }>
}

const isNonEmptyObject = (obj: object): boolean => Object.keys(obj).length > 0

interface ResolvedMediaField
{
  has: boolean
  resolved: Id<'mediaAssets'> | null
}

const resolveMediaField = (
  wire: WireItem,
  server: Doc<'boardItems'> | undefined,
  mediaExternalIdToId: Map<string, Id<'mediaAssets'>>
): ResolvedMediaField =>
{
  const has = Object.hasOwn(wire, 'mediaExternalId')
  const externalId = wire.mediaExternalId
  const resolved = !has
    ? (server?.mediaAssetId ?? null)
    : externalId
      ? (mediaExternalIdToId.get(externalId) ?? null)
      : null

  return { has, resolved }
}

const buildItemPatchFields = (
  server: Doc<'boardItems'>,
  wire: WireItem,
  resolvedTierId: Id<'boardTiers'> | null,
  media: ResolvedMediaField,
  resolvedTemplateItemId: Id<'templateItems'> | undefined
): ItemDiff['patch'][number]['fields'] =>
{
  const fields: ItemDiff['patch'][number]['fields'] = {}
  if (server.tierId !== resolvedTierId) fields.tierId = resolvedTierId
  if (server.order !== wire.order) fields.order = wire.order
  if (server.label !== wire.label) fields.label = wire.label
  if (server.backgroundColor !== wire.backgroundColor)
  {
    fields.backgroundColor = wire.backgroundColor
  }
  if ((server.mediaPlate ?? undefined) !== wire.mediaPlate)
  {
    fields.mediaPlate = wire.mediaPlate
  }
  if (server.altText !== wire.altText) fields.altText = wire.altText
  if (server.notes !== wire.notes) fields.notes = wire.notes
  if (server.aspectRatio !== wire.aspectRatio)
  {
    fields.aspectRatio = wire.aspectRatio
  }
  if (server.imageFit !== wire.imageFit) fields.imageFit = wire.imageFit
  if (!isSameItemTransform(server.transform, wire.transform))
  {
    fields.transform = wire.transform
  }
  if ((server.imagePadding ?? undefined) !== wire.imagePadding)
  {
    fields.imagePadding = wire.imagePadding
  }
  if (!itemLabelOptionsEqual(server.labelOptions, wire.labelOptions))
  {
    fields.labelOptions = wire.labelOptions
  }
  if (media.has && server.mediaAssetId !== media.resolved)
  {
    fields.mediaAssetId = media.resolved
  }
  if (
    resolvedTemplateItemId !== undefined &&
    server.templateItemId !== resolvedTemplateItemId
  )
  {
    fields.templateItemId = resolvedTemplateItemId
  }
  return fields
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

    if (!tierColorSpecEqual(server.colorSpec, wire.colorSpec))
    {
      fields.colorSpec = wire.colorSpec
    }

    if (!tierColorSpecEqual(server.rowColorSpec, wire.rowColorSpec))
    {
      fields.rowColorSpec = wire.rowColorSpec
    }

    if (isNonEmptyObject(fields))
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
  deletedItemExternalIds: ReadonlySet<string>,
  templateItemExternalIdToId: ReadonlyMap<
    string,
    Id<'templateItems'>
  > = new Map()
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
    const media = resolveMediaField(wire, server, mediaExternalIdToId)
    const isDeleted = deletedItemExternalIds.has(wire.externalId)
    const resolvedTierId = wire.tierId
      ? (tierExternalIdToId.get(wire.tierId) ?? null)
      : null
    const resolvedTemplateItemId = wire.sourceTemplateItemExternalId
      ? templateItemExternalIdToId.get(wire.sourceTemplateItemExternalId)
      : undefined

    if (!server)
    {
      diff.insert.push({
        externalId: wire.externalId,
        tierId: resolvedTierId,
        label: wire.label,
        backgroundColor: wire.backgroundColor,
        mediaPlate: wire.mediaPlate,
        altText: wire.altText,
        notes: wire.notes,
        mediaAssetId: media.resolved,
        order: wire.order,
        deletedAt: isDeleted ? now : null,
        aspectRatio: wire.aspectRatio,
        imageFit: wire.imageFit,
        transform: wire.transform,
        imagePadding: wire.imagePadding,
        labelOptions: wire.labelOptions,
        ...(resolvedTemplateItemId
          ? { templateItemId: resolvedTemplateItemId }
          : {}),
      })
      continue
    }

    if (isDeleted && server.deletedAt === null)
    {
      const fields = buildItemPatchFields(
        server,
        wire,
        resolvedTierId,
        media,
        resolvedTemplateItemId
      )
      diff.softDelete.push({
        id: server._id,
        deletedAt: now,
        ...(isNonEmptyObject(fields) ? { fields } : {}),
      })
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
          mediaPlate: wire.mediaPlate,
          altText: wire.altText,
          notes: wire.notes,
          aspectRatio: wire.aspectRatio,
          imageFit: wire.imageFit,
          transform: wire.transform,
          imagePadding: wire.imagePadding,
          labelOptions: wire.labelOptions,
          ...(resolvedTemplateItemId
            ? { templateItemId: resolvedTemplateItemId }
            : {}),
          ...(media.has ? { mediaAssetId: media.resolved } : {}),
        },
      })
      continue
    }

    const fields = buildItemPatchFields(
      server,
      wire,
      resolvedTierId,
      media,
      resolvedTemplateItemId
    )

    if (isNonEmptyObject(fields))
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
