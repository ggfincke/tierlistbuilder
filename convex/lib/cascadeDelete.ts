// convex/lib/cascadeDelete.ts
// shared page deletion helpers for scheduled cascade jobs

import type { Id, TableNames } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { BATCH_LIMITS } from './limits'

export const CASCADE_DELETE_PAGE_SIZE = BATCH_LIMITS.cascadeDelete

type CascadeRow = { _id: Id<TableNames> }

interface CascadePage
{
  page: CascadeRow[]
  isDone: boolean
  continueCursor: string
}

type CascadeArgs<
  Phase extends string,
  ParentKey extends string,
  ParentId extends Id<TableNames>,
> = Record<ParentKey, ParentId> & {
  cursor?: string | null
  phase?: Phase
}

interface DeleteCascadePageArgs<
  Phase extends string,
  ParentKey extends string,
  ParentId extends Id<TableNames>,
>
{
  ctx: MutationCtx
  page: CascadePage
  schedule: (args: CascadeArgs<Phase, ParentKey, ParentId>) => Promise<unknown>
  parentKey: ParentKey
  parentId: ParentId
  phase: Phase
  nextPhase?: Phase
}

export const deleteCascadePageAndSchedule = async <
  Phase extends string,
  ParentKey extends string,
  ParentId extends Id<TableNames>,
>(
  args: DeleteCascadePageArgs<Phase, ParentKey, ParentId>
): Promise<boolean> =>
{
  await Promise.all(args.page.page.map((row) => args.ctx.db.delete(row._id)))

  if (!args.page.isDone)
  {
    await args.schedule({
      [args.parentKey]: args.parentId,
      cursor: args.page.continueCursor,
      phase: args.phase,
    } as CascadeArgs<Phase, ParentKey, ParentId>)
    return true
  }

  if (args.nextPhase !== undefined)
  {
    await args.schedule({
      [args.parentKey]: args.parentId,
      cursor: null,
      phase: args.nextPhase,
    } as CascadeArgs<Phase, ParentKey, ParentId>)
    return true
  }

  return false
}
