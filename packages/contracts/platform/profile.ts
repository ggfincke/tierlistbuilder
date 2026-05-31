// packages/contracts/platform/profile.ts
// public profile (/u/:handle) contracts

import type { MarketplaceTemplateSummary } from '../marketplace/template'
import type { PublicProfileShowcase } from './showcase'
import type { UserPlan } from './user'

// public-facing profile resolved by handle. omits private fields (email,
// privacy, sessions); plan stays for the Plus badge
export interface PublicUserProfile
{
  id: string
  handle: string
  displayName: string | null
  bio: string | null
  location: string | null
  pronouns: string | null
  avatarUrl: string | null
  plan: UserPlan
  createdAt: number
  // tlotl showcase; null when the user has never created one
  showcase: PublicProfileShowcase | null
  // public templates this user authored, most-recent first
  templates: MarketplaceTemplateSummary[]
  // true when the author has more public templates than templates[] holds
  hasMoreTemplates: boolean
}
