import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { guideUpdatedAt } from '../editor/guideUpdatedAt'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const { version } = JSON.parse(readFileSync(new URL('../editor/package.json', import.meta.url), 'utf8')) as {
  version: string
}

export default defineConfig({
  base: '/RCM/app/',
  plugins: [react()],
  define: {
    __AI_GUIDE_UPDATED_AT__: JSON.stringify(guideUpdatedAt()),
    __APP_VERSION__: JSON.stringify(version)
  },
  server: { fs: { allow: [repoRoot] } },
  build: { target: 'es2022' }
})
