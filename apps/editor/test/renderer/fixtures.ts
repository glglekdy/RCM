import { basicTracks, emptyEditorData, serializeEditorData, type Note, type TimingPoint } from '@rcm/core'
import type { ProjectFiles } from '../../src/shared/api'
import { loadProject } from '../../src/renderer/src/editor/state/loadProject'
import { getChart, replaceChart, type ProjectDoc } from '../../src/renderer/src/editor/state/doc'

export function files(): ProjectFiles {
  const song = {
    formatVersion: 1,
    title: 'T',
    artist: 'A',
    audio: 'audio.ogg',
    offsetMs: 0,
    previewStartMs: 0,
    timing: [{ tick: 0, bpm: 120, beatsPerMeasure: 4 }]
  }
  const chart = { formatVersion: 1, name: 'NORMAL', level: 1, tracks: basicTracks(4), notes: [] }
  return {
    dir: 'C:/p',
    songText: JSON.stringify(song),
    charts: [{ file: 'normal.chart.json', text: JSON.stringify(chart) }],
    editorText: serializeEditorData(emptyEditorData())
  }
}

const loaded = loadProject(files())
if (!loaded.ok) throw new Error(`fixture failed to load: ${loaded.errors.join(', ')}`)
export const d0: ProjectDoc = loaded.doc

export function withNotes(
  doc: ProjectDoc,
  notes: Note[],
  trackCount?: number,
  file = 'normal.chart.json'
): ProjectDoc {
  const chart = getChart(doc, file)
  const tracks = trackCount === undefined ? chart.tracks : basicTracks(trackCount)
  return replaceChart(doc, file, { ...chart, notes, tracks })
}

export function withTiming(doc: ProjectDoc, timing: TimingPoint[]): ProjectDoc {
  return { ...doc, song: { ...doc.song, timing } }
}
