// tests/marketplace/accountTemplatesSection.test.ts
// Account template publish toggle follows publication state & never tears
// down an in-flight or failed publish.

import { describe, expect, it } from 'vitest'
import {
  canViewTemplateInGallery,
  getTemplatePublishControl,
} from '~/features/marketplace/model/account/templatePublishActions'

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

  it('links to the gallery only after a successful publish', () =>
  {
    expect(canViewTemplateInGallery({ publicationState: 'published' })).toBe(
      true
    )
    expect(canViewTemplateInGallery({ publicationState: 'unpublished' })).toBe(
      false
    )
    expect(
      canViewTemplateInGallery({ publicationState: 'publishPending' })
    ).toBe(false)
    expect(
      canViewTemplateInGallery({ publicationState: 'publishFailed' })
    ).toBe(false)
  })
})
