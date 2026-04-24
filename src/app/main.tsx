// src/app/main.tsx
// app entry point — mounts React root w/ StrictMode & ConvexAuthProvider

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import './index.css'
import App from './App.tsx'
import { convexClient } from '~/features/platform/sync/lib/convexClient'
import { ErrorBoundary } from '~/shared/ui/ErrorBoundary'

// mount app into DOM root
// outer boundary catches provider bootstrap; inner boundary resets UI failures
// w/o remounting Convex auth/session state
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary section="application bootstrap">
      <ConvexAuthProvider client={convexClient}>
        <ErrorBoundary section="the application">
          <App />
        </ErrorBoundary>
      </ConvexAuthProvider>
    </ErrorBoundary>
  </StrictMode>
)
