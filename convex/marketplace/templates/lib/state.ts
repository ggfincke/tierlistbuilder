// convex/marketplace/templates/lib/state.ts
// pure template publication/access-state predicates & state-field builders

import type { Doc } from '../../../_generated/dataModel'
import {
  classifyItemCount,
  getLargeTemplateFeatureState,
} from '../../../lib/entitlements'
import type {
  TemplateCardAccessState,
  TemplateJobStatus,
  TemplatePublicationState,
} from '@tierlistbuilder/contracts/marketplace/template'
import {
  isActiveTemplateJobStatus,
  isFinishedTemplateJobStatus,
} from '@tierlistbuilder/contracts/marketplace/template'
import type { UserPlan } from '@tierlistbuilder/contracts/platform/user'

export const isPublicTemplateRow = (
  template: Pick<Doc<'templates'>, 'isPubliclyListable'>
): boolean => template.isPubliclyListable

export const isPublishedTemplateRow = (
  template: Pick<Doc<'templates'>, 'publicationState'>
): boolean => template.publicationState === 'published'

export const buildTemplateStateFields = (
  itemCount: number,
  visibility: Doc<'templates'>['visibility'],
  publicationState: TemplatePublicationState = 'published'
) =>
{
  return {
    sizeClass: classifyItemCount(itemCount),
    publicationState,
    isPubliclyListable:
      publicationState === 'published' && visibility === 'public',
  }
}

export const getTemplateAccessState = (
  template: Pick<Doc<'templates'> | Doc<'templateCards'>, 'sizeClass'>,
  viewerPlan: UserPlan
): TemplateCardAccessState =>
{
  if (template.sizeClass === 'standard') return 'usable'
  if (viewerPlan !== 'plus') return 'requiresPlus'
  return getLargeTemplateFeatureState() === 'public'
    ? 'usable'
    : 'featureNotReady'
}

export const isActiveTemplateJob = (status: TemplateJobStatus): boolean =>
  isActiveTemplateJobStatus(status)

export const isFinishedTemplateJob = (status: TemplateJobStatus): boolean =>
  isFinishedTemplateJobStatus(status)
