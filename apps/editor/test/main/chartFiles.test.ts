import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chartExportName, MAX_CHART_BYTES, readChartFile } from '../../src/main/project/chartFiles'

let tmp: string

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-chart-'))
})
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('chartFiles', () => {
  it('.json 채보 파일을 읽음', async () => {
    const file = path.join(tmp, 'Hard.CHART.JSON')
    await fs.writeFile(file, '{"name":"하드"}')
    expect(await readChartFile(file)).toBe('{"name":"하드"}')
  })
  it('json이 아니거나 상대 경로·폴더·없는 파일·너무 큰 파일은 거부', async () => {
    await fs.writeFile(path.join(tmp, 'a.mp3'), 'x')
    await fs.mkdir(path.join(tmp, 'dir.json'))
    await fs.writeFile(path.join(tmp, 'big.json'), '')
    await fs.truncate(path.join(tmp, 'big.json'), MAX_CHART_BYTES + 1)
    await expect(readChartFile(path.join(tmp, 'a.mp3'))).rejects.toThrow('채보 파일')
    await expect(readChartFile('a.chart.json')).rejects.toThrow('채보 파일')
    await expect(readChartFile(42)).rejects.toThrow('채보 파일')
    await expect(readChartFile(path.join(tmp, 'dir.json'))).rejects.toThrow('찾을 수 없')
    await expect(readChartFile(path.join(tmp, 'gone.json'))).rejects.toThrow('찾을 수 없')
    await expect(readChartFile(path.join(tmp, 'big.json'))).rejects.toThrow('너무 커요')
  })
  it('내보낼 기본 파일 이름은 경로 없는 .chart.json만', () => {
    expect(chartExportName('hard.chart.json')).toBe('hard.chart.json')
    expect(chartExportName('../x.chart.json')).toBe('chart.chart.json')
    expect(chartExportName(path.join(tmp, 'x.chart.json'))).toBe('chart.chart.json')
    expect(chartExportName('a.txt')).toBe('chart.chart.json')
    expect(chartExportName(null)).toBe('chart.chart.json')
  })
})
