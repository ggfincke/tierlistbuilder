// vite.config.ts
// Vite build config — React plugin w/ fast-refresh & Tailwind CSS v4

import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { cloudflare } from '@cloudflare/vite-plugin'

const require = createRequire(import.meta.url)
const { version } = require('./package.json') as { version: string }

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
