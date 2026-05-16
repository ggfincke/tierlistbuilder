// src/shared/ui/DisplayHeadline.tsx
// editorial display headline — Inter-Black primary + Bungee-stamped accent
// (lime + mint shadow). primary optional; absent => accent is the title

import type { ReactNode } from 'react'

import { joinClassNames } from '~/shared/lib/className'

export type DisplayHeadlineSize = 'display' | 'page' | 'section'

interface DisplayHeadlineProps
{
  // mono uppercase tag above the title (eg "TEMPLATES · 80 AVAILABLE").
  // omit on dynamic surfaces where the title carries enough context
  eyebrow?: ReactNode
  // first half of the title — rendered in --t-text. clean white, no shadow.
  // omit to let the accent be the sole title (rendered at full size)
  primary?: ReactNode
  // optional second half — Bungee uppercase, lime fill, mint stamp shadow.
  // when primary is absent the accent scales to 1em (vs the inline 0.62em
  // stamp register) so it carries the full headline on its own
  accent?: ReactNode
  // pitch line under the title — muted body copy. defaults to max-w-xl;
  // override via `subtitleClassName` for wider columns (eg detail descriptions)
  subtitle?: ReactNode
  // typographic scale. display = page hero, page = secondary hero (detail
  // pages), section = in-page section heading (workspace board title)
  size?: DisplayHeadlineSize
  // if true, accent breaks onto its own line below primary (mockup pattern:
  // "Hot takes," / "DEFENDED"). ignored when primary is absent
  stacked?: boolean
  // semantic level — defaults match the visual scale but can be overridden
  // where the surrounding page already owns h1 (eg modal headers)
  as?: 'h1' | 'h2' | 'h3'
  // optional id passed through to the heading element for skip-links/aria
  id?: string
  // optional max-width constraint on the headline column. defaults vary by
  // size so long titles wrap naturally w/o constraining short ones
  maxWidthClassName?: string
  // pass-through className appended to the outer wrapper. callers use this
  // for spacing utilities (eg `mt-3`) w/o needing an extra wrapper div
  className?: string
  // override the subtitle paragraph's max-width + spacing utilities. pass
  // `'max-w-3xl'` for wider columns, or layout utilities (`'mt-2'`) to tune
  // the rhythm under the heading per surface
  subtitleClassName?: string
}

interface SizeRecipe
{
  fontSize: string
  leading: string
  tracking: string
  defaultElement: 'h1' | 'h2' | 'h3'
  defaultMaxWidth: string
}

const SIZE_RECIPES: Record<DisplayHeadlineSize, SizeRecipe> = {
  display: {
    fontSize: 'clamp(2.75rem, 6vw, 5rem)',
    leading: 'leading-[0.96]',
    tracking: 'tracking-[-0.04em]',
    defaultElement: 'h1',
    defaultMaxWidth: 'max-w-3xl',
  },
  page: {
    fontSize: 'clamp(2rem, 4.5vw, 3.25rem)',
    leading: 'leading-[1.02]',
    tracking: 'tracking-[-0.03em]',
    defaultElement: 'h1',
    defaultMaxWidth: 'max-w-2xl',
  },
  section: {
    fontSize: 'clamp(1.5rem, 2.4vw, 2rem)',
    leading: 'leading-[1.08]',
    tracking: 'tracking-[-0.025em]',
    defaultElement: 'h2',
    defaultMaxWidth: 'max-w-2xl',
  },
}

const DEFAULT_SUBTITLE_CLASS =
  'max-w-xl text-[14px] leading-relaxed text-[var(--t-text-muted)]'

export const DisplayHeadline = ({
  eyebrow,
  primary,
  accent,
  subtitle,
  size = 'display',
  stacked = false,
  as,
  id,
  maxWidthClassName,
  className,
  subtitleClassName,
}: DisplayHeadlineProps) =>
{
  const recipe = SIZE_RECIPES[size]
  const HeadingTag = as ?? recipe.defaultElement
  const hasPrimary = primary !== undefined && primary !== null
  const hasAccent = accent !== undefined && accent !== null
  // accent class assembly: keep the 0.62em stamp scale when inline w/ a
  // primary, lift to full 1em when standalone. `block` only applies in the
  // stacked composition (which itself requires a primary to stack beneath)
  const accentClass = joinClassNames(
    'display-accent',
    'display-accent-shadow',
    !hasPrimary && 'display-accent--full',
    hasPrimary && stacked && 'block'
  )
  const outerClass = joinClassNames(
    'flex flex-col gap-3',
    maxWidthClassName ?? recipe.defaultMaxWidth,
    className
  )
  // subtitleClassName fully replaces the default body class when provided so
  // callers can tune both max-width & vertical rhythm without fighting the
  // baked-in utilities. fall back to the standard muted body otherwise
  const subtitleClass = subtitleClassName ?? DEFAULT_SUBTITLE_CLASS

  return (
    <div className={outerClass}>
      {eyebrow !== undefined && eyebrow !== null && (
        <p
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--t-text-faint)]"
          style={{ fontFamily: 'var(--ts-mono)' }}
        >
          {eyebrow}
        </p>
      )}
      <HeadingTag
        id={id}
        className={joinClassNames(
          'font-black text-[var(--t-text)]',
          recipe.leading,
          recipe.tracking
        )}
        style={{ fontSize: recipe.fontSize }}
      >
        {hasPrimary && primary}
        {hasAccent && (
          <>
            {hasPrimary && !stacked && ' '}
            <span className={accentClass}>{accent}</span>
          </>
        )}
      </HeadingTag>
      {subtitle !== undefined && subtitle !== null && (
        <p className={subtitleClass}>{subtitle}</p>
      )}
    </div>
  )
}
