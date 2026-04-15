// src/features/platform/backend/convexClient.ts
// * convex client singleton — backend entry point for the frontend
// not yet mounted into a React provider; the provider lands alongside the
// auth UI PR. existing features import this client only via repository
// adapters under features/*/data/cloud/ — UI components must not import it
// directly

import { ConvexReactClient } from 'convex/react'

const deploymentUrl = import.meta.env.VITE_CONVEX_URL

// we deliberately fail fast at module load if the env var is missing during
// a cloud build — a silent fallback would mask deployment misconfiguration
if (!deploymentUrl)
{
  throw new Error(
    'VITE_CONVEX_URL is not set — run `npx convex dev` to provision a deployment'
  )
}

export const convexClient = new ConvexReactClient(deploymentUrl)
