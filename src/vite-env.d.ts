// src/vite-env.d.ts
// type declarations for Vite build-time constants

declare const __APP_VERSION__: string

interface ImportMetaEnv
{
  // convex deployment URL injected by `convex dev` into .env.local
  readonly VITE_CONVEX_URL: string
}

interface ImportMeta
{
  readonly env: ImportMetaEnv
}
