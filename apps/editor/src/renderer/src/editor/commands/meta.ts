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
