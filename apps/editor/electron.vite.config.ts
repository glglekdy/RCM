import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { guideUpdatedAt } from './guideUpdatedAt'

const bundled = ['@rcm/core', '@rcm/playfield']
// 워크스페이스 구조에서는 electron-builder가 node_modules를 수집하지 못하므로 main 번들에 포함한다
const bundledMain = [...bundled, 'electron-updater', 'yauzl', 'fflate']

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin({ exclude: bundledMain })] },
  preload: { plugins: [externalizeDepsPlugin({ exclude: bundled })] },
  renderer: {
    define: { __AI_GUIDE_UPDATED_AT__: JSON.stringify(guideUpdatedAt()) },
    resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
    plugins: [react()]
  }
})
