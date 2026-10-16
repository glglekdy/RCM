import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const bundled = ['@rcm/core', '@rcm/playfield']
// 워크스페이스 구조에서는 electron-builder가 node_modules를 수집하지 못하므로 main 번들에 포함한다
const bundledMain = [...bundled, 'electron-updater', 'yauzl']

const guideFile = fileURLToPath(new URL('../../docs/CHART_FORMAT_GUIDE.md', import.meta.url))

/** AI 가이드 문서를 마지막으로 고친 시각 (ISO). 커밋되지 않은 수정이 있거나 git을 못 쓰면 파일 수정 시각 */
function guideUpdatedAt(): string {
  try {
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: dirname(guideFile), encoding: 'utf8' }).trim()
    if (git('status', '--porcelain', '--', guideFile) === '') {
      const committed = git('log', '-1', '--format=%cI', '--', guideFile)
      if (committed) return new Date(committed).toISOString()
    }
  } catch {
    // git이 없거나 저장소가 아니면 아래로
  }
  return statSync(guideFile).mtime.toISOString()
}

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin({ exclude: bundledMain })] },
  preload: { plugins: [externalizeDepsPlugin({ exclude: bundled })] },
  renderer: {
    define: { __AI_GUIDE_UPDATED_AT__: JSON.stringify(guideUpdatedAt()) },
    resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
    plugins: [react()]
  }
})
