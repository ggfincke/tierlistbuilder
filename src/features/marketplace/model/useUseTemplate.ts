// src/features/marketplace/model/useUseTemplate.ts
// orchestrate the frontend-only use-template action

import { useCallback, useState } from 'react'

import { formatMarketplaceError } from '~/features/marketplace/model/formatters'
import { toast } from '~/shared/notifications/useToastStore'
import { logger } from '~/shared/lib/logger'

interface UseTemplateAction
{
  run: (slug: string, templateTitle: string) => Promise<void>
  isPending: boolean
}

export const useUseTemplate = (): UseTemplateAction =>
{
  const [isPending, setIsPending] = useState(false)

  const run = useCallback(
    async (_slug: string, templateTitle: string) =>
    {
      if (isPending) return

      setIsPending(true)
      try
      {
        throw new Error(
          `Template forking is unavailable in this frontend-only build: ${templateTitle}`
        )
      }
      catch (error)
      {
        logger.error('marketplace', 'useTemplate failed', error)
        toast(formatMarketplaceError(error), 'error')
      }
      finally
      {
        setIsPending(false)
      }
    },
    [isPending]
  )

  return { run, isPending }
}
