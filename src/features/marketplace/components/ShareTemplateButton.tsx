// src/features/marketplace/components/ShareTemplateButton.tsx
// share CTA on the detail page — prefers the native Web Share sheet on
// mobile, falls back to clipboard copy w/ a confirming toast

import { Check, Share2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getTemplateDetailPath } from '~/app/routes/pathname'
import { toast } from '~/shared/notifications/useToastStore'

interface ShareTemplateButtonProps
{
  slug: string
  templateTitle: string
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

const copyToClipboard = async (value: string): Promise<boolean> =>
{
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText)
  {
    try
    {
      await navigator.clipboard.writeText(value)
      return true
    }
    catch
    {
      // permission denied / insecure context — fall through to legacy copy
    }
  }
  if (typeof document === 'undefined') return false
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  let ok = false
  try
  {
    ok = document.execCommand('copy')
  }
  catch
  {
    ok = false
  }
  document.body.removeChild(textarea)
  return ok
}

const COPIED_FEEDBACK_MS = 1_400

export const ShareTemplateButton = ({
  slug,
  templateTitle,
  className,
  ariaLabel,
}: ShareTemplateButtonProps) =>
{
  const [copied, setCopied] = useState(false)
  const resetTimerRef = useRef<number | null>(null)

  // ensure the temporary "copied" badge tears down even if the user navigates
  // away before the timer would otherwise fire
  useEffect(
    () => () =>
    {
      if (resetTimerRef.current !== null)
      {
        window.clearTimeout(resetTimerRef.current)
        resetTimerRef.current = null
      }
    },
    []
  )

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
        if (error instanceof DOMException && error.name === 'AbortError')
        {
          return
        }
        // any other share failure: drop down to clipboard copy
      }
    }

    const ok = await copyToClipboard(shareUrl)
    if (ok)
    {
      setCopied(true)
      if (resetTimerRef.current !== null)
      {
        window.clearTimeout(resetTimerRef.current)
      }
      resetTimerRef.current = window.setTimeout(() =>
      {
        setCopied(false)
        resetTimerRef.current = null
      }, COPIED_FEEDBACK_MS)
      toast('Link copied to clipboard', 'success')
    }
    else
    {
      toast('Could not copy link', 'error')
    }
  }, [slug, templateTitle])

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel ?? `Share ${templateTitle}`}
      title="Share template"
      className={
        className ??
        'focus-custom inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'
      }
    >
      {copied ? (
        <Check className="h-4 w-4" strokeWidth={2} />
      ) : (
        <Share2 className="h-4 w-4" strokeWidth={1.8} />
      )}
    </button>
  )
}
