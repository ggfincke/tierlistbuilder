// vite.config.ts
// Vite build config — React plugin w/ fast-refresh & Tailwind CSS v4
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
