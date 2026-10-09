import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const bundled = ['@rcm/core', '@rcm/playfield']

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin({ exclude: bundled })] },
  preload: { plugins: [externalizeDepsPlugin({ exclude: bundled })] },
  renderer: {
    resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
    plugins: [react()]
  }
})
