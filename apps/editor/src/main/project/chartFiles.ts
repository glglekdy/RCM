import { promises as fs } from 'node:fs'
import path from 'node:path'

/** 불러올 채보 파일 크기 한도. 채보는 텍스트라 이보다 크면 채보가 아니다 */
export const MAX_CHART_BYTES = 32 * 1024 ** 2

/** 불러올 수 있는 채보 파일: `.chart.json`을 포함한 `.json` 파일 */
export const isChartImportFile = (file: string): boolean => path.extname(file).toLowerCase() === '.json'

/** 프로젝트 밖의 채보 파일을 읽는다. 절대 경로의 `.json` 파일만, 크기 한도 안에서. */
export async function readChartFile(file: unknown): Promise<string> {
  if (typeof file !== 'string' || !path.isAbsolute(file) || !isChartImportFile(file)) {
    throw new Error('채보 파일(.chart.json)만 불러올 수 있어요')
  }
  const stat = await fs.stat(file).catch(() => null)
  if (!stat?.isFile()) throw new Error('파일을 찾을 수 없어요')
  if (stat.size > MAX_CHART_BYTES) throw new Error('채보 파일이 너무 커요')
  return fs.readFile(file, 'utf8')
}

/** 내보낼 채보의 기본 파일 이름: 경로 없는 `<이름>.chart.json`만, 아니면 `chart.chart.json`. */
export function chartExportName(name: unknown): string {
  if (typeof name !== 'string') return 'chart.chart.json'
  const base = path.basename(name)
  return base === name && base.toLowerCase().endsWith('.chart.json') ? base : 'chart.chart.json'
}
