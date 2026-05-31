// src/features/marketplace/model/publish/publishVisibilityDefaults.ts
// derives publish-form visibility defaults from the signed-in user's settings

import type { RankingVisibility } from '@tierlistbuilder/contracts/marketplace/ranking'
import type { TemplateVisibility } from '@tierlistbuilder/contracts/marketplace/template'
import {
  DEFAULT_USER_PRIVACY_SETTINGS,
  type PublicUserMe,
} from '@tierlistbuilder/contracts/platform/user'

type UserWithPrivacy = Pick<PublicUserMe, 'privacy'>

export const getDefaultTemplatePublishVisibility = (
  user: UserWithPrivacy | null
): TemplateVisibility =>
  user?.privacy.defaultTemplateVisibility ??
  DEFAULT_USER_PRIVACY_SETTINGS.defaultTemplateVisibility

export const getDefaultRankingPublishVisibility = (
  user: UserWithPrivacy | null
): RankingVisibility =>
  user?.privacy.defaultRankingVisibility ??
  DEFAULT_USER_PRIVACY_SETTINGS.defaultRankingVisibility
