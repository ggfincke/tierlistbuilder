// src/features/platform/backend/convexClient.ts
// * convex client singleton — backend entry point for the frontend
// mounted into ConvexAuthProvider in src/app/main.tsx. UI components must
// not import this directly; go through features/*/data/cloud/ adapters or
// the auth slice's useAuthSession hook

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
