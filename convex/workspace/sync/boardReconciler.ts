// convex/workspace/sync/boardReconciler.ts
// pure server-side row-diff helpers for upsertBoardState reconciliation

import type { Doc, Id } from '../../_generated/dataModel'
import type {
  CloudBoardItemWire as WireItem,
  CloudBoardTierWire as WireTier,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'

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
    order: number
    deletedAt: number | null
    // client wall-clock stamp — reserved for future LWW resolution
    clientUpdatedAt?: number
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

// ! known limitation: the server currently applies wire-item changes in
// the order the client sends them. concurrent edits from two devices can
// lose either way depending on which push lands second. clientUpdatedAt
// on CloudBoardItemWire is plumbed so a future LWW pass can skip a stale
// resurrect or stale delete, but today the field is stored without being
// consulted during the merge. we accept this in exchange for shipping the
// end-to-end sync path & will revisit once the tombstone + undelete tests
// in tests/data/boardReconciler.test.ts exercise the conflict matrix

const hasOwnKey = (obj: Record<string, unknown>): boolean =>
  Object.keys(obj).length > 0

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

    if (hasOwnKey(fields as Record<string, unknown>))
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
  deletedItemExternalIds: Set<string>
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
    const hasMediaExternalId = Object.hasOwn(wire, 'mediaExternalId')
    const isDeleted = deletedItemExternalIds.has(wire.externalId)
    const resolvedTierId = wire.tierId
      ? (tierExternalIdToId.get(wire.tierId) ?? null)
      : null
    const resolvedMediaId = !hasMediaExternalId
      ? (server?.mediaAssetId ?? null)
      : wire.mediaExternalId
        ? (mediaExternalIdToId.get(wire.mediaExternalId) ?? null)
        : null

    if (!server)
    {
      diff.insert.push({
        externalId: wire.externalId,
        tierId: resolvedTierId,
        label: wire.label,
        backgroundColor: wire.backgroundColor,
        altText: wire.altText,
        mediaAssetId: resolvedMediaId,
        order: wire.order,
        deletedAt: isDeleted ? now : null,
        ...(wire.clientUpdatedAt !== undefined
          ? { clientUpdatedAt: wire.clientUpdatedAt }
          : {}),
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
          ...(hasMediaExternalId ? { mediaAssetId: resolvedMediaId } : {}),
          ...(wire.clientUpdatedAt !== undefined
            ? { clientUpdatedAt: wire.clientUpdatedAt }
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
    if (hasMediaExternalId && server.mediaAssetId !== resolvedMediaId)
    {
      fields.mediaAssetId = resolvedMediaId
    }
    if (
      wire.clientUpdatedAt !== undefined &&
      server.clientUpdatedAt !== wire.clientUpdatedAt
    )
    {
      fields.clientUpdatedAt = wire.clientUpdatedAt
    }

    if (hasOwnKey(fields as Record<string, unknown>))
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
