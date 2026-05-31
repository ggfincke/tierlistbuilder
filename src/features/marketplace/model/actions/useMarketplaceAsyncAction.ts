// src/features/marketplace/model/actions/useMarketplaceAsyncAction.ts
// marketplace command runner w/ shared logging, toast, & auth-gate behavior

import { useCallback, useState } from 'react'

import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { promptSignIn } from '~/features/platform/auth/model/useSignInPromptStore'
import { formatMarketplaceError } from '~/features/marketplace/model/formatters'
import { useAsyncAction } from '~/shared/hooks/useAsyncAction'
import { logger } from '~/shared/lib/logger'
import { toast } from '~/shared/notifications/useToastStore'

interface MarketplaceAsyncActionState<
  TArgs extends readonly unknown[],
  TResult,
>
{
  run: (...args: TArgs) => Promise<TResult | null>
  isPending: boolean
  error: string | null
  setError: (message: string | null) => void
  clearError: () => void
}

interface SignedInMarketplaceActionOptions
{
  signedOutError?: string | null
  promptOnSignedOut?: boolean
}

export const useMarketplaceAsyncAction = <
  TArgs extends readonly unknown[],
  TResult,
>(
  logTag: string,
  action: (...args: TArgs) => Promise<TResult>
): MarketplaceAsyncActionState<TArgs, TResult> =>
{
  const { pending, run: runAsync } = useAsyncAction()
  const [error, setError] = useState<string | null>(null)
  const clearError = useCallback(() => setError(null), [])

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | null> =>
    {
      let result: TResult | null = null
      const ok = await runAsync({
        action: async () =>
        {
          result = await action(...args)
        },
        errorMessage: 'Marketplace action failed',
        formatError: formatMarketplaceError,
        onError: (message, cause) =>
        {
          logger.error('marketplace', logTag, cause)
          setError(message)
          toast(message, 'error')
        },
        onSuccess: clearError,
      })
      return ok ? result : null
    },
    [action, clearError, logTag, runAsync]
  )

  return { run, isPending: pending, error, setError, clearError }
}

export const useVoidRun = <TArgs extends readonly unknown[]>(
  run: (...args: TArgs) => Promise<unknown>
): ((...args: TArgs) => Promise<void>) =>
  useCallback(
    async (...args: TArgs): Promise<void> =>
    {
      await run(...args)
    },
    [run]
  )

export const useSignedInMarketplaceAction = <
  TArgs extends readonly unknown[],
  TResult,
>(
  logTag: string,
  action: (...args: TArgs) => Promise<TResult>,
  {
    signedOutError = null,
    promptOnSignedOut = false,
  }: SignedInMarketplaceActionOptions = {}
): MarketplaceAsyncActionState<TArgs, TResult> =>
{
  const session = useAuthSession()
  const {
    run: runAction,
    isPending,
    error,
    setError,
    clearError,
  } = useMarketplaceAsyncAction<TArgs, TResult>(logTag, action)

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | null> =>
    {
      if (session.status !== 'signed-in')
      {
        if (signedOutError !== null)
        {
          setError(signedOutError)
        }
        if (promptOnSignedOut)
        {
          promptSignIn()
        }
        return null
      }

      return await runAction(...args)
    },
    [promptOnSignedOut, runAction, session.status, setError, signedOutError]
  )

  return { run, isPending, error, setError, clearError }
}
