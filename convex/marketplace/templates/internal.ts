// convex/marketplace/templates/internal.ts

import { v, type Infer } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { internal } from '../../_generated/api'
import { BATCH_LIMITS } from '../../lib/limits'
import { deleteTemplateParentForCascade } from './lib'

const cascadePhaseValidator = v.union(v.literal('items'), v.literal('tags'))
type CascadePhase = Infer<typeof cascadePhaseValidator>

export const cascadeDeleteTemplate = internalMutation({
  args: {
    templateId: v.id('templates'),
    cursor: v.optional(v.union(v.string(), v.null())),
    phase: v.optional(cascadePhaseValidator),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
  {
    const template = await ctx.db.get(args.templateId)
    if (template)
    {
      await deleteTemplateParentForCascade(ctx, template)
    }

    const phase: CascadePhase = args.phase ?? 'items'
    if (phase === 'items')
    {
      const page = await ctx.db
        .query('templateItems')
        .withIndex('byTemplate', (q) => q.eq('templateId', args.templateId))
        .paginate({
          numItems: BATCH_LIMITS.cascadeDelete,
          cursor: args.cursor ?? null,
        })

      await Promise.all(page.page.map((item) => ctx.db.delete(item._id)))

      if (!page.isDone)
      {
        await ctx.scheduler.runAfter(
          0,
          internal.marketplace.templates.internal.cascadeDeleteTemplate,
          {
            templateId: args.templateId,
            cursor: page.continueCursor,
            phase: 'items',
          }
        )
        return null
      }

      await ctx.scheduler.runAfter(
        0,
        internal.marketplace.templates.internal.cascadeDeleteTemplate,
        { templateId: args.templateId, cursor: null, phase: 'tags' }
      )
      return null
    }

    const tagPage = await ctx.db
      .query('templateTags')
      .withIndex('byTemplate', (q) => q.eq('templateId', args.templateId))
      .paginate({
        numItems: BATCH_LIMITS.cascadeDelete,
        cursor: args.cursor ?? null,
      })

    await Promise.all(tagPage.page.map((row) => ctx.db.delete(row._id)))

    if (!tagPage.isDone)
    {
      await ctx.scheduler.runAfter(
        0,
        internal.marketplace.templates.internal.cascadeDeleteTemplate,
        {
          templateId: args.templateId,
          cursor: tagPage.continueCursor,
          phase: 'tags',
        }
      )
      return null
    }

    return null
  },
})
