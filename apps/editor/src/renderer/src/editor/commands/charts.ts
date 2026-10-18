import {
  MAX_COLUMNS,
  MIN_COLUMNS,
  trackErrors,
  type AnyChart,
  type Chart,
  type FlickMode,
  type FreeChart,
  type Track
} from '@rcm/core'
import type { ProjectDoc } from '../state/doc'

/** 새 채보를 붙인다. 파일 이름은 이름에서 만들고, 겹치면 `-2`, `-3`…을 붙인다. 이름이 비면 null. */
function withChart(
  doc: ProjectDoc,
  name: string,
  make: (name: string) => AnyChart
): { doc: ProjectDoc; file: string } | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  const base = trimmed.toLowerCase().replace(/[\\/:*?"<>|]/g, '_')
  const taken = new Set(doc.charts.map((c) => c.file.toLowerCase()))
  let file = `${base}.chart.json`
  for (let i = 2; taken.has(file); i++) file = `${base}-${i}.chart.json`
  return { doc: { ...doc, charts: [...doc.charts, { file, chart: make(trimmed) }] }, file }
}

/** 새 난이도 채보를 추가한다. 이름이 비었거나 트랙 목록이 잘못됐으면 null. */
export function addChart(
  doc: ProjectDoc,
  name: string,
  tracks: Track[]
): { doc: ProjectDoc; file: string } | null {
  if (trackErrors(tracks, 'tracks').length > 0) return null
  return withChart(doc, name, (trimmed): Chart => ({ formatVersion: 1, name: trimmed, level: 1, tracks, notes: [] }))
}

/** 새 자유형(모바일) 난이도 채보를 추가한다. 이름이 비었거나 칸 수가 범위 밖이면 null. */
export function addFreeChart(
  doc: ProjectDoc,
  name: string,
  columns: number,
  flickMode: FlickMode
): { doc: ProjectDoc; file: string } | null {
  if (!Number.isInteger(columns) || columns < MIN_COLUMNS || columns > MAX_COLUMNS) return null
  return withChart(
    doc,
    name,
    (trimmed): FreeChart => ({
      formatVersion: 1,
      layout: 'free',
      name: trimmed,
      level: 1,
      columns,
      flickMode,
      notes: []
    })
  )
}
