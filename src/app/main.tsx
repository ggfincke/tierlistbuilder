// src/app/main.tsx
// app entry point — mounts React root w/ StrictMode & ConvexAuthProvider

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import './index.css'
import App from './App.tsx'
import { convexClient } from '@/features/platform/backend/convexClient'
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary'

// mount app into DOM root
// ErrorBoundary wraps ConvexAuthProvider so an auth bootstrap throw still
// surfaces the themed fallback instead of a blank page
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary section="the application">
      <ConvexAuthProvider client={convexClient}>
        <App />
      </ConvexAuthProvider>
    </ErrorBoundary>
  </StrictMode>
)
