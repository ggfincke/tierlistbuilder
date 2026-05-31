// src/features/platform/sync/lib/convexClient.ts
// * lazy Convex client singleton mounted into ConvexAuthProvider in main.tsx.
// imperative cloud adapters resolve it at call time

import { ConvexReactClient } from 'convex/react'

let convexClient: ConvexReactClient | null = null

const getDeploymentUrl = (): string =>
{
  const deploymentUrl = import.meta.env.VITE_CONVEX_URL

  if (!deploymentUrl)
  {
    throw new Error(
      'VITE_CONVEX_URL is not set — run `npx convex dev` to provision a deployment'
    )
  }

  return deploymentUrl
}

export const getConvexClient = (): ConvexReactClient =>
{
  convexClient ??= new ConvexReactClient(getDeploymentUrl())
  return convexClient
}
