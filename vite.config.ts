// vite.config.ts
// Vite build config — React plugin w/ fast-refresh, Tailwind CSS v4, & PWA

import { createRequire } from 'node:module'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

import { cloudflare } from '@cloudflare/vite-plugin'

const require = createRequire(import.meta.url)
const { version } = require('./package.json') as { version: string }
const srcRoot = path.resolve(__dirname, './src')
const convexRoot = path.resolve(__dirname, './convex')
const contractsRoot = path.resolve(__dirname, './packages/contracts')
const sourceAlias = {
  find: /^@\//,
  replacement: `${srcRoot}/`,
}
// resolve @convex/_generated/* imports for the typed api & dataModel
const convexAlias = {
  find: /^@convex\//,
  replacement: `${convexRoot}/`,
}
// resolve subpath imports like @tierlistbuilder/contracts/workspace/board
const contractsSubpathAlias = {
  find: /^@tierlistbuilder\/contracts\/(.*)$/,
  replacement: `${contractsRoot}/$1`,
}
// resolve bare import @tierlistbuilder/contracts to the barrel
const contractsBarrelAlias = {
  find: /^@tierlistbuilder\/contracts$/,
  replacement: `${contractsRoot}/index.ts`,
}

export default defineConfig({
  resolve: {
    alias: [
      sourceAlias,
      convexAlias,
      contractsSubpathAlias,
      contractsBarrelAlias,
    ],
  },
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  test: {
    alias: [
      sourceAlias,
      convexAlias,
      contractsSubpathAlias,
      contractsBarrelAlias,
    ],
  },
})
