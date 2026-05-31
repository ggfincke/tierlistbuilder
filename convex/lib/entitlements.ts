// convex/lib/entitlements.ts
// server-derived account limits for cloud sync & marketplace template actions

import { ConvexError } from 'convex/values'
import type { UserPlan } from '@tierlistbuilder/contracts/platform/user'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import type { TemplateSizeClass } from '@tierlistbuilder/contracts/marketplace/template'
import {
  MAX_LARGE_CLOUD_BOARD_ITEMS,
  MAX_STANDARD_CLOUD_BOARD_ITEMS,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

type DbCtx = MutationCtx | QueryCtx

export type LargeTemplateFeatureState = 'disabled' | 'internal' | 'public'

export interface PlanEntitlements
{
  plan: UserPlan
  maxCloudBoardItems: number
}

const normalizeLargeTemplateFeatureState = (
  value: string | undefined
): LargeTemplateFeatureState =>
{
  if (value === 'internal' || value === 'public') return value
  return 'disabled'
}

export const classifyItemCount = (itemCount: number): TemplateSizeClass =>
  itemCount <= MAX_STANDARD_CLOUD_BOARD_ITEMS ? 'standard' : 'large'

export const getLargeTemplateFeatureState = (): LargeTemplateFeatureState =>
  normalizeLargeTemplateFeatureState(process.env.LARGE_TEMPLATE_FEATURE_STATE)

export const getPlanEntitlements = async (
  ctx: DbCtx,
  userId: Id<'users'>
): Promise<PlanEntitlements> =>
{
  const user = await ctx.db.get(userId)
  if (!user)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.notFound,
      message: 'user not found',
    })
  }

  const plan = user.plan ?? 'free'
  return {
    plan,
    maxCloudBoardItems:
      plan === 'plus'
        ? MAX_LARGE_CLOUD_BOARD_ITEMS
        : MAX_STANDARD_CLOUD_BOARD_ITEMS,
  }
}

export const assertCanCloudSyncBoard = async (
  ctx: DbCtx,
  userId: Id<'users'>,
  itemCount: number
): Promise<void> =>
{
  const entitlements = await getPlanEntitlements(ctx, userId)
  if (itemCount <= entitlements.maxCloudBoardItems) return

  throw new ConvexError({
    code: CONVEX_ERROR_CODES.cloudItemLimitExceeded,
    message: `cloud sync supports ${entitlements.maxCloudBoardItems} items on the ${entitlements.plan} plan`,
    maxItems: entitlements.maxCloudBoardItems,
    itemCount,
  })
}

const assertCanUseLargeTemplateFeature = async (
  ctx: DbCtx,
  userId: Id<'users'>,
  itemCount: number,
  copy: {
    plusMessage: string
    notReadyMessage: string
  }
): Promise<void> =>
{
  if (itemCount > MAX_LARGE_CLOUD_BOARD_ITEMS)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.cloudItemLimitExceeded,
      message: `templates cannot exceed ${MAX_LARGE_CLOUD_BOARD_ITEMS} items`,
      maxItems: MAX_LARGE_CLOUD_BOARD_ITEMS,
      itemCount,
    })
  }

  if (classifyItemCount(itemCount) === 'standard') return

  const entitlements = await getPlanEntitlements(ctx, userId)
  if (entitlements.plan !== 'plus')
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.largeTemplateRequiresPlus,
      message: copy.plusMessage,
      itemCount,
    })
  }

  const featureState = getLargeTemplateFeatureState()
  if (featureState === 'public') return

  throw new ConvexError({
    code: CONVEX_ERROR_CODES.largeTemplateFeatureNotReady,
    message: copy.notReadyMessage,
    itemCount,
    featureState,
  })
}

export const assertCanPublishTemplate = async (
  ctx: DbCtx,
  userId: Id<'users'>,
  itemCount: number
): Promise<void> =>
  await assertCanUseLargeTemplateFeature(ctx, userId, itemCount, {
    plusMessage: 'large template publishing requires Plus',
    notReadyMessage: 'large template publish jobs are not ready',
  })

export const assertCanUseTemplate = async (
  ctx: DbCtx,
  userId: Id<'users'>,
  template: Pick<Doc<'templates'>, 'itemCount'>
): Promise<void> =>
  await assertCanUseLargeTemplateFeature(ctx, userId, template.itemCount, {
    plusMessage: 'large template use requires Plus',
    notReadyMessage: 'large template clone jobs are not ready',
  })

export const assertRankingFitsSingleTransaction = (
  itemCount: number,
  operation: 'publish' | 'remix'
): void =>
{
  if (itemCount <= MAX_STANDARD_CLOUD_BOARD_ITEMS) return

  throw new ConvexError({
    code: CONVEX_ERROR_CODES.cloudItemLimitExceeded,
    message: `ranking ${operation} supports up to ${MAX_STANDARD_CLOUD_BOARD_ITEMS} items until large-ranking jobs are available`,
    maxItems: MAX_STANDARD_CLOUD_BOARD_ITEMS,
    itemCount,
  })
}
