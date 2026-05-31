// src/features/marketplace/ui/template/ShareTemplateButton.tsx
// share CTA on the detail page — prefers the native Web Share sheet on
// mobile, falls back to clipboard copy w/ a confirming toast

import { Check, Share2 } from 'lucide-react'
import { useCallback } from 'react'

import { getTemplateDetailPath } from '~/shared/routes/pathname'
import { isAbortError } from '~/shared/lib/errors'
import { useClipboardCopy } from '~/shared/hooks/useClipboardCopy'
import { toast } from '~/shared/notifications/useToastStore'
import { IconButton, type IconButtonSize } from '~/shared/ui/IconButton'

interface ShareTemplateButtonProps
{
  slug: string
  templateTitle: string
  size?: IconButtonSize
  className?: string
  ariaLabel?: string
}

const buildShareUrl = (slug: string): string =>
{
  const path = getTemplateDetailPath(slug)
  if (typeof window === 'undefined')
  {
    return path
  }
  return new URL(path, window.location.origin).toString()
}

const COPIED_FEEDBACK_MS = 1_400

export const ShareTemplateButton = ({
  slug,
  templateTitle,
  size = 'md',
  className,
  ariaLabel,
}: ShareTemplateButtonProps) =>
{
  const { copied, copy } = useClipboardCopy(COPIED_FEEDBACK_MS)

  const handleClick = useCallback(async () =>
  {
    const shareUrl = buildShareUrl(slug)

    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function'
    )
    {
      try
      {
        await navigator.share({ title: templateTitle, url: shareUrl })
        return
      }
      catch (error)
      {
        // user cancelled — `AbortError` is expected & should not surface a toast
        if (isAbortError(error)) return
        // any other share failure: drop down to clipboard copy
      }
    }

    const ok = await copy(shareUrl)
    if (ok)
    {
      toast('Link copied to clipboard', 'success')
    }
    else
    {
      toast('Could not copy link', 'error')
    }
  }, [copy, slug, templateTitle])

  return (
    <IconButton
      size={size}
      onClick={handleClick}
      aria-label={ariaLabel ?? `Share ${templateTitle}`}
      title="Share template"
      className={className}
    >
      {copied ? (
        <Check className="h-4 w-4" strokeWidth={2} />
      ) : (
        <Share2 className="h-4 w-4" strokeWidth={1.8} />
      )}
    </IconButton>
  )
}
