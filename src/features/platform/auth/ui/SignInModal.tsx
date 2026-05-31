// src/features/platform/auth/ui/SignInModal.tsx
// email/password sign-in & sign-up modal

import { BaseModal } from '~/shared/overlay/BaseModal'
import { DialogActions } from '~/shared/overlay/DialogActions'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { useId, useRef, useState, type FormEvent } from 'react'

import { useAuthActions } from '~/features/platform/auth/model/useAuthActions'
import {
  mapAuthError,
  type AuthMode,
} from '~/features/platform/auth/model/authErrors'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { TextInput } from '~/shared/ui/TextInput'

interface SignInModalProps
{
  open: boolean
  onClose: () => void
}

export const SignInModal = ({ open, onClose }: SignInModalProps) =>
{
  const { signIn } = useAuthActions()
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const emailInputId = useId()
  const passwordInputId = useId()
  const errorId = useId()
  const emailRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) =>
  {
    event.preventDefault()
    setError(null)

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password)
    {
      setError('Email & password are required.')
      return
    }
    if (mode === 'sign-up' && password.length < 8)
    {
      setError('Password must be at least 8 characters.')
      return
    }

    setPending(true)
    try
    {
      await signIn('password', {
        email: trimmedEmail,
        password,
        flow: mode === 'sign-up' ? 'signUp' : 'signIn',
      })
      // success — clear local state & dismiss. useAuthSession will flip
      // to signed-in shortly after the handshake completes
      setEmail('')
      setPassword('')
      onClose()
    }
    catch (err)
    {
      setError(
        err instanceof Error
          ? mapAuthError(err.message, mode)
          : 'Something went wrong. Try again.'
      )
    }
    finally
    {
      setPending(false)
    }
  }

  const switchMode = (next: AuthMode) =>
  {
    if (next === mode)
    {
      return
    }
    setMode(next)
    setError(null)
  }

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={descriptionId}
      initialFocusRef={emailRef}
      panelClassName="w-full max-w-sm p-4"
    >
      <ModalHeader titleId={titleId}>
        {mode === 'sign-in' ? 'Sign in' : 'Create account'}
      </ModalHeader>
      <p id={descriptionId} className="mt-1 text-sm text-[var(--t-text-muted)]">
        {mode === 'sign-in'
          ? 'Sign in to sync your boards across devices.'
          : 'Create an account to sync your boards across devices.'}
      </p>

      <div
        role="tablist"
        aria-label="Auth mode"
        className="mt-3 flex gap-1 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] p-0.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'sign-in'}
          onClick={() => switchMode('sign-in')}
          className={`focus-custom flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--t-accent)] ${
            mode === 'sign-in'
              ? 'bg-[var(--t-bg-active)] text-[var(--t-text)] shadow-sm'
              : 'text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)]'
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'sign-up'}
          onClick={() => switchMode('sign-up')}
          className={`focus-custom flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--t-accent)] ${
            mode === 'sign-up'
              ? 'bg-[var(--t-bg-active)] text-[var(--t-text)] shadow-sm'
              : 'text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)]'
          }`}
        >
          Create account
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <div>
          <label
            htmlFor={emailInputId}
            className="block text-xs font-medium text-[var(--t-text-secondary)]"
          >
            Email
          </label>
          <TextInput
            ref={emailRef}
            id={emailInputId}
            type="email"
            autoComplete="email"
            required
            disabled={pending}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            size="md"
            className="mt-1 w-full"
            aria-describedby={error ? errorId : undefined}
          />
        </div>
        <div>
          <label
            htmlFor={passwordInputId}
            className="block text-xs font-medium text-[var(--t-text-secondary)]"
          >
            Password
          </label>
          <TextInput
            id={passwordInputId}
            type="password"
            autoComplete={
              mode === 'sign-up' ? 'new-password' : 'current-password'
            }
            required
            minLength={mode === 'sign-up' ? 8 : undefined}
            disabled={pending}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            size="md"
            className="mt-1 w-full"
            aria-describedby={error ? errorId : undefined}
          />
          {mode === 'sign-up' && (
            <p className="mt-1 text-xs text-[var(--t-text-faint)]">
              At least 8 characters.
            </p>
          )}
        </div>

        {error && (
          <p
            id={errorId}
            role="alert"
            className="text-xs text-[var(--t-destructive-hover)]"
          >
            {error}
          </p>
        )}

        <DialogActions className="flex justify-end gap-2 pt-1">
          <SecondaryButton type="button" disabled={pending} onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" size="md" disabled={pending}>
            {pending
              ? mode === 'sign-up'
                ? 'Creating…'
                : 'Signing in…'
              : mode === 'sign-up'
                ? 'Create account'
                : 'Sign in'}
          </PrimaryButton>
        </DialogActions>
      </form>
    </BaseModal>
  )
}
