import { promises as fs } from 'node:fs'
import path from 'node:path'
import { MAX_CHART_BYTES, chartExportName } from '../../shared/project/files'

export { MAX_CHART_BYTES, chartExportName }

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
