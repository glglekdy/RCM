import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const guideFile = fileURLToPath(new URL('../../docs/CHART_FORMAT_GUIDE.md', import.meta.url))

/** AI 가이드 문서를 마지막으로 고친 시각 (ISO). 커밋되지 않은 수정이 있거나 git을 못 쓰면 파일 수정 시각 */
export function guideUpdatedAt(): string {
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
