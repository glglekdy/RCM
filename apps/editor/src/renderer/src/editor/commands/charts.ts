import {
  MAX_COLUMNS,
  MIN_COLUMNS,
  parseAnyChart,
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

/** 다른 채보와 이름이 겹치면 ` (2)`, ` (3)`…을 붙인다 (대소문자 무시). */
function uniqueChartName(doc: ProjectDoc, name: string): string {
  const taken = new Set(doc.charts.map((c) => c.chart.name.toLowerCase()))
  let unique = name
  for (let i = 2; taken.has(unique.toLowerCase()); i++) unique = `${name} (${i})`
  return unique
}

/**
 * 프로젝트 밖의 채보 파일들을 새 난이도로 붙인다. 읽지 못한 파일은 건너뛰고 `파일 이름: 이유`로 모은다.
 * 이름이 겹치면 ` (2)`…를 붙이고, 이름이 비었으면 파일 이름을 쓴다. 노트는 tick 그대로 가져온다.
 */
export function importCharts(
  doc: ProjectDoc,
  files: readonly { name: string; text: string }[]
): { doc: ProjectDoc; added: string[]; failed: string[] } {
  const added: string[] = []
  const failed: string[] = []
  for (const f of files) {
    const parsed = parseAnyChart(f.text, f.name)
    if (!parsed.ok) {
      failed.push(`${f.name}: ${parsed.errors[0] ?? '채보 파일이 아니에요'}`)
      continue
    }
    const chart = parsed.value
    const stem = f.name.replace(/(\.chart)?\.json$/i, '')
    const r = withChart(doc, uniqueChartName(doc, chart.name.trim() || stem), (name) => ({ ...chart, name }))
    if (!r) {
      failed.push(`${f.name}: 채보 이름이 비어 있어요`)
      continue
    }
    doc = r.doc
    added.push(r.file)
  }
  return { doc, added, failed }
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
