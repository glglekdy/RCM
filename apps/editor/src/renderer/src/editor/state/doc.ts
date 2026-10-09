import type { Chart, EditorData, Song } from '@rcm/core'

export interface ChartEntry {
  file: string
  chart: Chart
}

/** 불변 문서: 바꿀 때는 항상 새 객체를 만들고, 바뀌지 않은 부분은 같은 참조를 유지한다. */
export interface ProjectDoc {
  song: Song
  charts: ChartEntry[]
  editorData: EditorData
}

export function getChart(doc: ProjectDoc, file: string): Chart {
  const entry = doc.charts.find((c) => c.file === file)
  if (!entry) throw new Error(`채보를 찾을 수 없어요: ${file}`)
  return entry.chart
}

export function replaceChart(doc: ProjectDoc, file: string, chart: Chart): ProjectDoc {
  getChart(doc, file)
  return {
    ...doc,
    charts: doc.charts.map((c) => (c.file === file ? { file, chart } : c))
  }
}
