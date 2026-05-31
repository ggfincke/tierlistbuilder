// src/features/platform/settings/ui/PasswordChangeDialog.tsx
// password-change modal for Convex Auth password accounts

import { useId, useState } from 'react'

import { MIN_PASSWORD_LENGTH } from '@tierlistbuilder/contracts/platform/user'
import { useChangePasswordAction } from '~/features/platform/auth/model/useAccountMutations'
import { formatError } from '~/shared/lib/errors'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { DialogActions } from '~/shared/overlay/DialogActions'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { toast } from '~/shared/notifications/useToastStore'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { Field, PasswordField } from '~/shared/ui/settings/SettingsChrome'

interface PasswordChangeDialogProps
{
  open: boolean
  onClose: () => void
  username: string
}

export const PasswordChangeDialog = ({
  open,
  onClose,
  username,
}: PasswordChangeDialogProps) =>
{
  const titleId = useId()
  const currentId = useId()
  const nextId = useId()
  const confirmId = useId()
  const changePassword = useChangePasswordAction()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetAndClose = () =>
  {
    if (pending) return
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError(null)
    onClose()
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) =>
  {
    event.preventDefault()
    if (pending) return
    if (newPassword.length < MIN_PASSWORD_LENGTH)
    {
      setError(
        `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`
      )
      return
    }
    if (newPassword !== confirmPassword)
    {
      setError('New password fields do not match.')
      return
    }

    setPending(true)
    setError(null)
    try
    {
      await changePassword({ currentPassword, newPassword })
      toast('Password updated', 'success')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onClose()
    }
    catch (err)
    {
      setError(formatError(err, 'Failed to update password.'))
    }
    finally
    {
      setPending(false)
    }
  }

  return (
    <BaseModal
      open={open}
      labelledBy={titleId}
      onClose={resetAndClose}
      closeOnBackdrop={!pending}
      closeOnEscape={!pending}
      panelClassName="w-full max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <ModalHeader titleId={titleId}>Update password</ModalHeader>
        {/* hidden username anchor so password managers tie the new credential
            to this account */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={username}
          readOnly
          tabIndex={-1}
          className="sr-only"
        />
        <Field label="Current password" htmlFor={currentId}>
          <PasswordField
            id={currentId}
            name="current-password"
            value={currentPassword}
            autoComplete="current-password"
            disabled={pending}
            onChange={setCurrentPassword}
          />
        </Field>
        <Field
          label="New password"
          htmlFor={nextId}
          hint={`Use at least ${MIN_PASSWORD_LENGTH} characters.`}
        >
          <PasswordField
            id={nextId}
            name="new-password"
            value={newPassword}
            autoComplete="new-password"
            disabled={pending}
            onChange={setNewPassword}
          />
        </Field>
        <Field label="Confirm new password" htmlFor={confirmId}>
          <PasswordField
            id={confirmId}
            name="confirm-new-password"
            value={confirmPassword}
            autoComplete="new-password"
            disabled={pending}
            onChange={setConfirmPassword}
          />
        </Field>
        {error && (
          <p className="rounded-lg border border-[color-mix(in_srgb,var(--t-destructive)_50%,transparent)] bg-[color-mix(in_srgb,var(--t-destructive)_8%,transparent)] px-3 py-2 text-[12px] text-[var(--t-destructive-hover)]">
            {error}
          </p>
        )}
        <DialogActions>
          <SecondaryButton
            type="button"
            disabled={pending}
            onClick={resetAndClose}
          >
            Cancel
          </SecondaryButton>
          <PrimaryButton
            type="submit"
            disabled={
              pending ||
              currentPassword.length === 0 ||
              newPassword.length === 0 ||
              confirmPassword.length === 0
            }
          >
            {pending ? 'Updating...' : 'Update password'}
          </PrimaryButton>
        </DialogActions>
      </form>
    </BaseModal>
  )
}
