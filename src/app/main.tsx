// src/app/main.tsx
// app entry point — mounts React root w/ StrictMode

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from '~/shared/ui/ErrorBoundary'

// mount app into DOM root
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary section="the application">
      <App />
    </ErrorBoundary>
  </StrictMode>
)
