// src/features/marketplace/ui/consensus/section/ConsensusActionButtons.tsx
// compare, remix, & fork actions for a consensus lane

import { ArrowLeftRight, Loader2, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { MarketplaceTemplateDetail } from '@tierlistbuilder/contracts/marketplace/template'
import { useRemixConsensus } from '~/features/marketplace/model/remix/useRemixConsensus'
import { useRemixRanking } from '~/features/marketplace/model/remix/useRemixRanking'
import { useUseTemplate } from '~/features/marketplace/model/remix/useUseTemplate'
import {
  ACCESS_META,
  isTemplateAccessBlocked,
} from '~/features/marketplace/model/accessMeta'

const ACTION_PILL_CLASS =
  'focus-custom flex h-full flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-dashed border-[var(--t-border)] bg-transparent px-3 py-2 text-[12px] font-medium text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'

interface ConsensusActionButtonsProps
{
  compareHref: string | null
  templateSlug: string
  templateTitle: string
  criterionExternalId: string
  access: MarketplaceTemplateDetail['access']
  activeRanking: { slug: string; title: string } | null
  consensusRemixable: boolean
}

interface ConsensusPrimaryAction
{
  idleLabel: string
  run: () => void
}

export const ConsensusActionButtons = ({
  compareHref,
  templateSlug,
  templateTitle,
  criterionExternalId,
  access,
  activeRanking,
  consensusRemixable,
}: ConsensusActionButtonsProps) =>
{
  const { run: runUseTemplate, isPending: isUseTemplatePending } =
    useUseTemplate()
  const { run: runRemixRanking, isPending: isRemixRankingPending } =
    useRemixRanking()
  const { run: runRemixConsensus, isPending: isRemixConsensusPending } =
    useRemixConsensus()
  const accessMeta = ACCESS_META[access]
  const accessBlocked = isTemplateAccessBlocked(access)
  const isRemixPending = isRemixRankingPending || isRemixConsensusPending
  const isPending = isUseTemplatePending || isRemixPending
  const primaryAction: ConsensusPrimaryAction = activeRanking
    ? {
        idleLabel: 'Remix this ranking',
        run: () => runRemixRanking(activeRanking.slug, activeRanking.title),
      }
    : consensusRemixable
      ? {
          idleLabel: 'Remix this ranking',
          run: () =>
            runRemixConsensus({
              templateSlug,
              templateTitle,
              criterionExternalId,
            }),
        }
      : {
          idleLabel: 'New ranking',
          run: () =>
            runUseTemplate(templateSlug, templateTitle, {
              preferredCriterionExternalId: criterionExternalId,
            }),
        }
  const label = accessBlocked
    ? accessMeta.ctaLabel
    : isRemixPending
      ? 'Remixing…'
      : isUseTemplatePending
        ? 'Forking…'
        : primaryAction.idleLabel

  return (
    <div className="flex h-full w-full gap-2">
      {compareHref && (
        <Link to={compareHref} className={ACTION_PILL_CLASS}>
          <ArrowLeftRight className="h-3 w-3" strokeWidth={2.2} />
          Compare
        </Link>
      )}
      <button
        type="button"
        onClick={primaryAction.run}
        disabled={isPending || accessBlocked}
        title={accessMeta.ctaTooltip ?? undefined}
        className={`${ACTION_PILL_CLASS} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {isPending && !accessBlocked ? (
          <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.2} />
        ) : (
          <Plus className="h-3 w-3" strokeWidth={2.4} />
        )}
        {label}
      </button>
    </div>
  )
}
