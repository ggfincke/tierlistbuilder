// tests/model/publishVisibilityDefaults.test.ts
// publish-form visibility defaults from account privacy settings

import { describe, expect, it } from 'vitest'

import { DEFAULT_USER_PRIVACY_SETTINGS } from '@tierlistbuilder/contracts/platform/user'
import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import {
  getDefaultRankingPublishVisibility,
  getDefaultTemplatePublishVisibility,
} from '~/features/marketplace/model/publish/publishVisibilityDefaults'

const userWithPrivacy = (
  privacy: PublicUserMe['privacy']
): Pick<PublicUserMe, 'privacy'> => ({ privacy })

describe('publish visibility defaults', () =>
{
  it('falls back to the contract defaults without a signed-in user', () =>
  {
    expect(getDefaultTemplatePublishVisibility(null)).toBe(
      DEFAULT_USER_PRIVACY_SETTINGS.defaultTemplateVisibility
    )
    expect(getDefaultRankingPublishVisibility(null)).toBe(
      DEFAULT_USER_PRIVACY_SETTINGS.defaultRankingVisibility
    )
  })

  it('uses the signed-in user privacy settings', () =>
  {
    const user = userWithPrivacy({
      defaultTemplateVisibility: 'unlisted',
      defaultRankingVisibility: 'unlisted',
      showInMembersDirectory: false,
      hideProfileFromSearch: true,
      allowAiTraining: true,
    })

    expect(getDefaultTemplatePublishVisibility(user)).toBe('unlisted')
    expect(getDefaultRankingPublishVisibility(user)).toBe('unlisted')
  })
})
