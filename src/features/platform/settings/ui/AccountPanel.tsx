// src/features/platform/settings/ui/AccountPanel.tsx
// Account tab — sign-in details, active sessions, & plan/billing

import { useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'

import type {
  PublicUserMe,
  UserPlan,
} from '@tierlistbuilder/contracts/platform/user'
import { AccountSessionsSection } from '~/features/platform/auth/ui/AccountSessionsSection'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import {
  Field,
  SetSection,
  SettingsTabLayout,
} from '~/shared/ui/settings/SettingsChrome'
import { PasswordChangeDialog } from './PasswordChangeDialog'
import { PlanBadge } from './PlanBadge'

const ReadonlyValue = ({ children }: { children: ReactNode }) => (
  <p className="truncate rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] px-3 py-2 text-[13px] text-[var(--t-text-secondary)]">
    {children}
  </p>
)

const AccountSection = ({ user }: { user: PublicUserMe }) =>
{
  const [passwordOpen, setPasswordOpen] = useState(false)

  return (
    <SetSection eyebrow="Sign in" title="Account">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Email">
          <ReadonlyValue>{user.email ?? 'No email on file'}</ReadonlyValue>
        </Field>
        <Field label="Sign-in method">
          <ReadonlyValue>Email &amp; password</ReadonlyValue>
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <SecondaryButton type="button" onClick={() => setPasswordOpen(true)}>
          Update password
        </SecondaryButton>
      </div>
      {/*
        TODO(backend): 2FA + recovery codes. Password change is wired via
        @convex-dev/auth, but no TOTP/recovery-code backend exists yet.
      */}
      <PasswordChangeDialog
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        username={user.email ?? ''}
      />
    </SetSection>
  )
}

const SessionsSection = ({ onSignedOut }: { onSignedOut: () => void }) => (
  <SetSection
    eyebrow="Security"
    title="Active sessions"
    subtitle="Sign out anywhere you don't recognize."
  >
    <AccountSessionsSection onClose={onSignedOut} />
  </SetSection>
)

const PLAN_FEATURES = [
  'Unlimited boards',
  'Community templates & forking',
  'PNG & link exports',
]

const PlanSection = ({ plan }: { plan: UserPlan }) => (
  <SetSection eyebrow="Billing" title="Plan & billing">
    <div className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
            Current plan
          </p>
          <p className="text-[18px] font-black leading-tight text-[var(--t-text)]">
            {plan === 'plus' ? 'Plus' : 'Free'}
          </p>
        </div>
        <PlanBadge plan={plan} />
      </div>
      <ul className="mt-3 space-y-1.5 border-t border-[var(--t-border)] pt-3">
        {PLAN_FEATURES.map((feature) => (
          <li
            key={feature}
            className="flex items-center gap-2 text-[11px] text-[var(--t-text-secondary)]"
          >
            <Check
              className="h-3 w-3 shrink-0 text-[var(--t-accent)]"
              strokeWidth={3}
            />
            {feature}
          </li>
        ))}
      </ul>
    </div>
    {/*
      TODO(backend): Stripe billing. `plan` is real, but there is no billing
      integration — price, renewal date, card on file, invoices, &
      Manage/Subscribe are mocked. Wire Stripe, then restore the design's
      billing card + payment-method row + Manage/Invoices actions.
    */}
  </SetSection>
)

interface AccountPanelProps
{
  user: PublicUserMe
  onSignedOut: () => void
}

export const AccountPanel = ({ user, onSignedOut }: AccountPanelProps) => (
  <SettingsTabLayout
    main={
      <>
        <AccountSection user={user} />
        <SessionsSection onSignedOut={onSignedOut} />
      </>
    }
    aside={<PlanSection plan={user.plan} />}
  />
)
