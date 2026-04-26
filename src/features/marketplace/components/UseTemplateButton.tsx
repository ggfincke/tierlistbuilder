// src/features/marketplace/components/UseTemplateButton.tsx
// CTA used on the detail page — kicks off the use-template orchestration &
// shows pending state on the same button so the user has clear feedback

import { ArrowRight, Loader2 } from 'lucide-react'

import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { useUseTemplate } from '~/features/marketplace/model/useUseTemplate'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'

interface UseTemplateButtonProps
{
  slug: string
  templateTitle: string
  size?: 'sm' | 'md'
  // pass to make the button stretch in flex layouts (eg the detail-page CTA
  // cluster where it sits next to a fixed-width share button)
  className?: string
}

export const UseTemplateButton = ({
  slug,
  templateTitle,
  size = 'md',
  className,
}: UseTemplateButtonProps) =>
{
  const session = useAuthSession()
  const { run, isPending } = useUseTemplate()
  const sessionLoading = session.status === 'loading'

  return (
    <PrimaryButton
      type="button"
      size={size}
      disabled={isPending || sessionLoading}
      onClick={() => run(slug, templateTitle)}
      className={className}
    >
      {isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
      ) : (
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
      )}
      {isPending ? 'Forking…' : 'Use this template'}
    </PrimaryButton>
  )
}
