// src/shared/ui/PageState.tsx
// centered page-state primitives for signed-out, empty, & missing pages

import type { ReactNode } from 'react'

import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { CENTERED_PAGE_STATE_CLASS } from '~/shared/ui/pageContainer'

interface CenteredPageStateProps
{
  title: ReactNode
  body?: ReactNode
  action?: ReactNode
}

export const CenteredPageState = ({
  title,
  body,
  action,
}: CenteredPageStateProps) => (
  <div className={CENTERED_PAGE_STATE_CLASS}>
    {title}
    {body !== undefined && body !== null && (
      <p className="max-w-sm text-[14px] text-[var(--t-text-muted)]">{body}</p>
    )}
    {action}
  </div>
)

interface SignedOutPromptProps
{
  title: ReactNode
  body: ReactNode
  onSignIn: () => void
}

export const SignedOutPrompt = ({
  title,
  body,
  onSignIn,
}: SignedOutPromptProps) => (
  <CenteredPageState
    title={title}
    body={body}
    action={
      <PrimaryButton size="md" onClick={onSignIn}>
        Sign in
      </PrimaryButton>
    }
  />
)
