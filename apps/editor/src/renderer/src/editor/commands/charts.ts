import { MAX_LANES, MIN_LANES, type Chart } from '@rcm/core'
import type { ProjectDoc } from '../state/doc'

/** 새 난이도 채보를 추가한다. 이름이 비었거나 레인 수가 범위 밖이면 null. */
export function addChart(
  doc: ProjectDoc,
  name: string,
  lanes: number
): { doc: ProjectDoc; file: string } | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  if (!Number.isInteger(lanes) || lanes < MIN_LANES || lanes > MAX_LANES) return null
  const base = trimmed.toLowerCase().replace(/[\\/:*?"<>|]/g, '_')
  const taken = new Set(doc.charts.map((c) => c.file.toLowerCase()))
  let file = `${base}.chart.json`
  for (let i = 2; taken.has(file); i++) file = `${base}-${i}.chart.json`
  const chart: Chart = { formatVersion: 1, name: trimmed, level: 1, lanes, notes: [] }
  return { doc: { ...doc, charts: [...doc.charts, { file, chart }] }, file }
}
