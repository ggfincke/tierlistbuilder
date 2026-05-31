// src/shared/ui/NotFoundSurface.tsx
// centered not-found surface for app & marketplace routes

import type { ReactNode } from 'react'

import { ArrowLeft } from 'lucide-react'

import { ButtonLink } from '~/shared/ui/Button'
import { PAGE_SHELL } from '~/shared/ui/pageContainer'

interface NotFoundSurfaceProps
{
  title: string
  body: ReactNode
  actionLabel: string
  to: string
  code?: ReactNode
}

export const NotFoundSurface = ({
  title,
  body,
  actionLabel,
  to,
  code,
}: NotFoundSurfaceProps) => (
  <section
    className={`${PAGE_SHELL} flex min-h-[60vh] items-center justify-center pt-20 text-center sm:pt-24`}
  >
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold text-[var(--t-text)]">{title}</h1>
      <p className="mt-2 text-sm text-[var(--t-text-muted)]">
        {body}
        {code !== undefined && code !== null && (
          <>
            {' '}
            <code>{code}</code>.
          </>
        )}
      </p>
      <ButtonLink to={to} variant="primary" size="md" className="mt-5">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {actionLabel}
      </ButtonLink>
    </div>
  </section>
)
