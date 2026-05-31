// src/features/marketplace/model/remix/localBoardForkToast.ts
// shared signed-in/signed-out toast copy for local board forks

import { promptSignIn } from '~/features/platform/auth/model/useSignInPromptStore'
import { toast, toastWithAction } from '~/shared/notifications/useToastStore'

interface NotifyLocalBoardForkedInput
{
  verb: 'Forked' | 'Remixed'
  title: string
  signedIn: boolean
}

export const notifyLocalBoardForked = ({
  verb,
  title,
  signedIn,
}: NotifyLocalBoardForkedInput) =>
{
  if (signedIn)
  {
    toast(`${verb} "${title}" into a new board`, 'success')
    return
  }

  toastWithAction(
    `${verb} "${title}" locally. Sign in to sync.`,
    { label: 'Sign in', onClick: promptSignIn },
    'info'
  )
}
