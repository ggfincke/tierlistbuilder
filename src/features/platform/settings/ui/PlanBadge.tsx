// src/features/platform/settings/ui/PlanBadge.tsx
// account plan badge

import type { UserPlan } from '@tierlistbuilder/contracts/platform/user'

export const PlanBadge = ({ plan }: { plan: UserPlan }) =>
  plan === 'plus' ? (
    <span className="rounded bg-[var(--t-accent-2)] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#0a0a0a]">
      Plus
    </span>
  ) : (
    <span className="rounded border border-[var(--t-border)] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t-text-muted)]">
      Free
    </span>
  )
