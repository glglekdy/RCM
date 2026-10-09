import { emptyEditorData, parseChart, parseEditorData, parseSong } from '@rcm/core'
import type { Chart, EditorData, Song } from '@rcm/core'
import type { ProjectFiles } from '../../../../shared/api'
import type { ChartEntry, ProjectDoc } from './doc'

export function loadProject(
  files: ProjectFiles
): { ok: true; doc: ProjectDoc } | { ok: false; errors: string[] } {
  const errors: string[] = []

  let song: Song | null = null
  const s = parseSong(files.songText)
  if (s.ok) song = s.value
  else errors.push(...s.errors)

  const charts: ChartEntry[] = []
  for (const { file, text } of files.charts) {
    const c = parseChart(text, file)
    if (c.ok) charts.push({ file, chart: c.value as Chart })
    else errors.push(...c.errors)
  }
  if (files.charts.length === 0) errors.push('채보 파일(*.chart.json)이 없어요')

  let editorData: EditorData = emptyEditorData()
  if (files.editorText !== null) {
    const e = parseEditorData(files.editorText)
    if (e.ok) editorData = e.value
    else errors.push(...e.errors)
  }

  if (errors.length > 0 || !song) return { ok: false, errors }
  return { ok: true, doc: { song, charts, editorData } }
}
