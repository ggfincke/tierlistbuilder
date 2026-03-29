// src/main.tsx
// app entry point — mounts React root w/ StrictMode

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { migrateStorageKeys } from './utils/storage'

// migrate legacy "maker" localStorage keys before stores hydrate
migrateStorageKeys()

// mount app into DOM root
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
