import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { guideUpdatedAt } from '../editor/guideUpdatedAt'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const { version } = JSON.parse(readFileSync(new URL('../editor/package.json', import.meta.url), 'utf8')) as {
  version: string
}

export default defineConfig({
  base: '/RCM/main/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'RCM 채보 에디터',
        short_name: 'RCM',
        display: 'standalone',
        background_color: '#141414',
        theme_color: '#141414',
        start_url: '/RCM/main/',
        scope: '/RCM/main/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,ogg,mp3,json}']
      },
      devOptions: { enabled: false }
    })
  ],
  define: {
    __AI_GUIDE_UPDATED_AT__: JSON.stringify(guideUpdatedAt()),
    __APP_VERSION__: JSON.stringify(version)
  },
  server: { fs: { allow: [repoRoot] } },
  build: { target: 'es2022' }
})
