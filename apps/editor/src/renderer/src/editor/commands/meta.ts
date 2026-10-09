import type { Song } from '@rcm/core'
import { getChart, replaceChart, type ProjectDoc } from '../state/doc'

export function updateSong(
  doc: ProjectDoc,
  patch: Partial<Pick<Song, 'title' | 'artist' | 'previewStartMs'>>
): ProjectDoc | null {
  const p = patch.previewStartMs
  if (p !== undefined && !(Number.isFinite(p) && p >= 0)) return null
  return { ...doc, song: { ...doc.song, ...patch } }
}

export function updateChartMeta(
  doc: ProjectDoc,
  file: string,
  patch: { name?: string; level?: number }
): ProjectDoc | null {
  if (patch.name !== undefined && patch.name.trim() === '') return null
  const l = patch.level
  if (l !== undefined && !(Number.isInteger(l) && l >= 1 && l <= 99)) return null
  return replaceChart(doc, file, { ...getChart(doc, file), ...patch })
}

/** lane >= lanes 인 노트는 지운다. removed는 지워진 노트 수. */
export function setChartLanes(
  doc: ProjectDoc,
  file: string,
  lanes: number
): { doc: ProjectDoc; removed: number } | null {
  if (!Number.isInteger(lanes) || lanes < 4 || lanes > 8) return null
  const chart = getChart(doc, file)
  const notes = chart.notes.filter((n) => n.lane < lanes)
  return {
    doc: replaceChart(doc, file, { ...chart, lanes, notes }),
    removed: chart.notes.length - notes.length
  }
}
