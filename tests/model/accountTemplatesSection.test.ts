// tests/model/accountTemplatesSection.test.ts
// Account template publish toggle follows publication state & never tears
// down an in-flight or failed publish.

import { describe, expect, it } from 'vitest'
import { getTemplatePublishControl } from '~/features/marketplace/model/account/templatePublishActions'

describe('account template publish control', () =>
{
  it('lets published direct-link templates be unpublished', () =>
  {
    const directLinkTemplate = {
      publicationState: 'published' as const,
      isPubliclyListable: false,
    }

    expect(getTemplatePublishControl(directLinkTemplate)).toEqual({
      kind: 'toggle',
      action: 'unpublish',
    })
  })

  it('routes unpublished templates through republish', () =>
  {
    expect(getTemplatePublishControl({ publicationState: 'unpublished' })).toEqual({
      kind: 'toggle',
      action: 'republish',
    })
  })

  it('does not toggle an in-flight publish', () =>
  {
    expect(getTemplatePublishControl({ publicationState: 'publishPending' })).toEqual({
      kind: 'pending',
    })
  })

  it('does not unpublish a failed publish', () =>
  {
    expect(getTemplatePublishControl({ publicationState: 'publishFailed' })).toEqual({
      kind: 'failed',
    })
  })
})
