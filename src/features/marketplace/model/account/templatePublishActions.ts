// src/features/marketplace/model/account/templatePublishActions.ts
// Publish-toggle decisions for the owned-template management surface.

import type { MarketplaceTemplateManagementItem } from '@tierlistbuilder/contracts/marketplace/template'

export type TemplatePublishAction = 'unpublish' | 'republish'

// the publish toggle only governs the published <-> unpublished lifecycle.
// publishPending/publishFailed are publish-job states, not toggle targets:
// unpublish would tear down an in-flight/failed publish, so surface as status
export type TemplatePublishControl =
  | { kind: 'toggle'; action: TemplatePublishAction }
  | { kind: 'pending' }
  | { kind: 'failed' }

type TemplatePublishControlSource = Pick<
  MarketplaceTemplateManagementItem,
  'publicationState'
>

export const getTemplatePublishControl = (
  template: TemplatePublishControlSource
): TemplatePublishControl =>
{
  switch (template.publicationState)
  {
    case 'published':
      return { kind: 'toggle', action: 'unpublish' }
    case 'unpublished':
      return { kind: 'toggle', action: 'republish' }
    case 'publishPending':
      return { kind: 'pending' }
    case 'publishFailed':
      return { kind: 'failed' }
    default:
    {
      const exhaustive: never = template.publicationState
      return exhaustive
    }
  }
}
