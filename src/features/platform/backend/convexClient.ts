// src/features/platform/backend/convexClient.ts
// * convex client singleton — mounted into ConvexAuthProvider in main.tsx
// UI goes through data/cloud/ adapters or useAuthSession, not this directly

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
