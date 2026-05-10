// src/features/marketplace/components/cards/UseTemplateButton.tsx
// CTA used on the detail page — kicks off the use-template orchestration &
// shows pending state on the same button so the user has clear feedback

import { ArrowRight, Loader2 } from 'lucide-react'

import type { TemplateCardAccessState } from '@tierlistbuilder/contracts/marketplace/template'
import {
  ACCESS_META,
  isTemplateAccessBlocked,
} from '~/features/marketplace/model/accessMeta'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { useUseTemplate } from '~/features/marketplace/model/useUseTemplate'

interface UseTemplateButtonProps
{
  slug: string
  templateTitle: string
  access?: TemplateCardAccessState
  size?: 'sm' | 'md'
  preferredCriterionExternalId?: string
  // pass to make the button stretch in flex layouts (eg the detail-page CTA
  // cluster where it sits next to a fixed-width share button)
  className?: string
}

export const UseTemplateButton = ({
  slug,
  templateTitle,
  access = 'usable',
  size = 'md',
  preferredCriterionExternalId,
  className,
}: UseTemplateButtonProps) =>
{
  const { run, isPending } = useUseTemplate()
  const meta = ACCESS_META[access]
  const blocked = isTemplateAccessBlocked(access)
  const label = isPending && !blocked ? 'Forking…' : meta.ctaLabel

  return (
    <PrimaryButton
      type="button"
      size={size}
      disabled={isPending || blocked}
      onClick={() => run(slug, templateTitle, { preferredCriterionExternalId })}
      className={className}
      title={meta.ctaTooltip ?? undefined}
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
      ) : (
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
      )}
      {label}
    </PrimaryButton>
  )
}
