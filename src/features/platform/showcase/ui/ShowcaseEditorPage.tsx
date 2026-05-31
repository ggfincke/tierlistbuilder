// src/features/platform/showcase/ui/ShowcaseEditorPage.tsx
// showcase editor placeholder for the extracted UI shell

import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

import { useDocumentTitle } from '~/shared/hooks/useDocumentTitle'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'

const PAGE_CLASS =
  'relative z-10 mx-auto w-full max-w-[1320px] px-4 pb-24 pt-20 sm:px-8 sm:pt-24'

export const ShowcaseEditorPage = () =>
{
  const navigate = useNavigate()
  useDocumentTitle('Your tier list')

  return (
    <main className={PAGE_CLASS}>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="focus-custom inline-flex items-center gap-1.5 rounded-md border border-[var(--t-border)] px-3 py-2 text-sm font-semibold text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to app
      </button>
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-[28px] font-black text-[var(--t-text)]">
          Your tier list
        </h1>
        <p className="max-w-sm text-[14px] text-[var(--t-text-muted)]">
          Showcase editing is not available in this build.
        </p>
        <PrimaryButton size="md" onClick={() => navigate('/')}>
          Return home
        </PrimaryButton>
      </div>
    </main>
  )
}
