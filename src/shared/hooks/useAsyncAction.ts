// src/shared/hooks/useAsyncAction.ts
// pending-state wrapper for async UI actions w/ shared toast error handling

import { useCallback, useState } from 'react'

import { formatError } from '~/shared/lib/errors'
import { toast } from '~/shared/notifications/useToastStore'

type PendingResetMode = 'always' | 'error'

interface RunAsyncActionOptions
{
  action: () => Promise<unknown>
  errorMessage: string
  formatError?: (error: unknown, fallbackMessage: string) => string
  successMessage?: string
  onError?: (message: string, error: unknown) => void
  onFinally?: () => void
  onSuccess?: () => void
  resetPending?: PendingResetMode
}

export const useAsyncAction = () =>
{
  const [pending, setPending] = useState(false)

  const run = useCallback(
    async ({
      action,
      errorMessage,
      formatError: formatActionError = formatError,
      successMessage,
      onError,
      onFinally,
      onSuccess,
      resetPending = 'always',
    }: RunAsyncActionOptions): Promise<boolean> =>
    {
      if (pending) return false
      let succeeded = false
      setPending(true)
      try
      {
        await action()
        succeeded = true
        if (successMessage) toast(successMessage, 'success')
        onSuccess?.()
        return true
      }
      catch (error)
      {
        const message = formatActionError(error, errorMessage)
        if (onError) onError(message, error)
        else toast(message, 'error')
        return false
      }
      finally
      {
        if (resetPending === 'always' || !succeeded)
        {
          setPending(false)
        }
        onFinally?.()
      }
    },
    [pending]
  )

  return { pending, run }
}
