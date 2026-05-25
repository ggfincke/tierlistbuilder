// src/features/platform/profile/ui/ProfileStates.tsx
// loading skeleton & not-found state for the public profile page

import { Link } from 'react-router-dom'

import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
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
  <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
    <h1 className="text-[28px] font-black tracking-[-0.02em] text-[var(--t-text)]">
      Profile not found
    </h1>
    <p className="max-w-sm text-[14px] text-[var(--t-text-muted)]">
      This profile doesn&apos;t exist, or the handle may have changed.
    </p>
    <Link
      to={TEMPLATES_ROUTE_PATH}
      className="focus-custom rounded-lg border border-[var(--t-border)] px-3.5 py-1.5 text-[12px] font-bold text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
    >
      Browse templates
    </Link>
  </div>
)
