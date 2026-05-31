// src/features/platform/profile/ui/ProfileStates.tsx
// loading skeleton & not-found state for the public profile page

import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import { ButtonLink } from '~/shared/ui/Button'
import { CenteredPageState } from '~/shared/ui/PageState'
import { SkeletonBlock, SkeletonCard, SkeletonText } from '~/shared/ui/Skeleton'

export const ProfileSkeleton = () => (
  <div aria-hidden="true">
    <div className="flex items-start gap-5 sm:gap-6">
      <SkeletonBlock className="h-20 w-20 rounded-full sm:h-24 sm:w-24" />
      <div className="flex-1 space-y-3 pt-2">
        <SkeletonBlock className="h-8 w-56 rounded" tone="strong" />
        <SkeletonText className="w-32" tone="soft" />
        <SkeletonText className="w-2/3" tone="soft" />
      </div>
    </div>
    <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  </div>
)

export const ProfileNotFound = () => (
  <CenteredPageState
    title={
      <h1 className="text-[28px] font-black text-[var(--t-text)]">
        Profile not found
      </h1>
    }
    body="This profile doesn't exist, or the handle may have changed."
    action={
      <ButtonLink
        to={TEMPLATES_ROUTE_PATH}
        size="sm"
        className="rounded-lg text-[12px] font-bold"
      >
        Browse templates
      </ButtonLink>
    }
  />
)
