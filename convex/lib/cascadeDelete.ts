// convex/lib/cascadeDelete.ts
// shared page deletion helpers for scheduled cascade jobs

import { ConvexError } from 'convex/values'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
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

interface CascadePhaseStep<Phase extends string>
{
  phase: Phase
  page: (cursor: string | null) => Promise<CascadePage>
}

interface RunCascadePhaseMachineArgs<
  Phase extends string,
  ParentKey extends string,
  ParentId extends Id<TableNames>,
>
{
  ctx: MutationCtx
  phases: readonly [CascadePhaseStep<Phase>, ...CascadePhaseStep<Phase>[]]
  schedule: (args: CascadeArgs<Phase, ParentKey, ParentId>) => Promise<unknown>
  parentKey: ParentKey
  parentId: ParentId
  phase?: Phase
  cursor?: string | null
}

const deleteCascadePageAndSchedule = async <
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

export const runCascadePhaseMachine = async <
  Phase extends string,
  ParentKey extends string,
  ParentId extends Id<TableNames>,
>(
  args: RunCascadePhaseMachineArgs<Phase, ParentKey, ParentId>
): Promise<boolean> =>
{
  const phase = args.phase ?? args.phases[0].phase
  const phaseIndex = args.phases.findIndex((step) => step.phase === phase)
  if (phaseIndex < 0)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: `unknown cascade phase: ${phase}`,
    })
  }

  const step = args.phases[phaseIndex]
  const page = await step.page(args.cursor ?? null)
  const nextPhase = args.phases[phaseIndex + 1]?.phase
  return await deleteCascadePageAndSchedule({
    ctx: args.ctx,
    page,
    schedule: args.schedule,
    parentKey: args.parentKey,
    parentId: args.parentId,
    phase,
    nextPhase,
  })
}
