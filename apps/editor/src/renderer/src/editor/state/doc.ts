import { isFreeChart, type AnyChart, type Chart, type EditorData, type FreeChart, type Song } from '@rcm/core'

export interface ChartEntry {
  file: string
  chart: AnyChart
}

/** 불변 문서: 바꿀 때는 항상 새 객체를 만들고, 바뀌지 않은 부분은 같은 참조를 유지한다. */
export interface ProjectDoc {
  song: Song
  charts: ChartEntry[]
  editorData: EditorData
}

export function getChart(doc: ProjectDoc, file: string): AnyChart {
  const entry = doc.charts.find((c) => c.file === file)
  if (!entry) throw new Error(`채보를 찾을 수 없어요: ${file}`)
  return entry.chart
}

/** 레인형 채보. 자유형이면 던진다 (레인형 전용 편집에서만 부른다). */
export function getLaneChart(doc: ProjectDoc, file: string): Chart {
  const chart = getChart(doc, file)
  if (isFreeChart(chart)) throw new Error(`레인형 채보가 아니에요: ${file}`)
  return chart
}

/** 자유형 채보. 레인형이면 던진다 (자유형 전용 편집에서만 부른다). */
export function getFreeChart(doc: ProjectDoc, file: string): FreeChart {
  const chart = getChart(doc, file)
  if (!isFreeChart(chart)) throw new Error(`자유형 채보가 아니에요: ${file}`)
  return chart
}

export function replaceChart(doc: ProjectDoc, file: string, chart: AnyChart): ProjectDoc {
  getChart(doc, file)
  return {
    ...doc,
    charts: doc.charts.map((c) => (c.file === file ? { file, chart } : c))
  }
}
