// src/features/marketplace/model/remix/runLocalFork.ts
// shared local-fork completion path for template use & ranking remix actions

import type { NavigateFunction } from 'react-router-dom'

import { notifyLocalBoardForked } from '~/features/marketplace/model/remix/localBoardForkToast'

interface RunLocalForkOptions
{
  verb: 'Forked' | 'Remixed'
  title: string
  signedIn: boolean
  navigate: NavigateFunction
  fork: () => Promise<unknown>
}

export const runLocalFork = async ({
  verb,
  title,
  signedIn,
  navigate,
  fork,
}: RunLocalForkOptions): Promise<void> =>
{
  await fork()
  notifyLocalBoardForked({ verb, title, signedIn })
  navigate('/')
}
