import { serializeChart, serializeEditorData, serializeSong } from '@rcm/core'
import type { Chart, EditorData, Song } from '@rcm/core'
import type { ProjectDoc } from './doc'

/** 마지막으로 저장(또는 로드)된 시점의 객체 참조. 참조 비교로 변경 여부를 판단한다. */
export interface SavedRefs {
  song: Song
  charts: Map<string, Chart>
  editorData: EditorData
}

export function savedRefsOf(doc: ProjectDoc): SavedRefs {
  return {
    song: doc.song,
    charts: new Map(doc.charts.map((c) => [c.file, c.chart])),
    editorData: doc.editorData
  }
}

export function isDirty(doc: ProjectDoc, saved: SavedRefs): boolean {
  return (
    doc.song !== saved.song ||
    doc.editorData !== saved.editorData ||
    doc.charts.some((c) => saved.charts.get(c.file) !== c.chart)
  )
}

export function dirtyFiles(doc: ProjectDoc, saved: SavedRefs): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = []
  if (doc.song !== saved.song) out.push({ name: 'song.json', text: serializeSong(doc.song) })
  for (const { file, chart } of doc.charts) {
    if (saved.charts.get(file) !== chart) out.push({ name: file, text: serializeChart(chart) })
  }
  if (doc.editorData !== saved.editorData) {
    out.push({ name: 'editor.json', text: serializeEditorData(doc.editorData) })
  }
  return out
}
