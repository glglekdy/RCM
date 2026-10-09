import { emptyEditorData, serializeEditorData } from '@rcm/core'
import type { ProjectFiles } from '../../src/shared/api'
import { loadProject } from '../../src/renderer/src/editor/state/loadProject'
import type { ProjectDoc } from '../../src/renderer/src/editor/state/doc'

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
  const chart = { formatVersion: 1, name: 'NORMAL', level: 1, lanes: 4, notes: [] }
  return {
    dir: 'C:/p',
    audioPath: 'C:/p/audio.ogg',
    songText: JSON.stringify(song),
    charts: [{ file: 'normal.chart.json', text: JSON.stringify(chart) }],
    editorText: serializeEditorData(emptyEditorData())
  }
}

const loaded = loadProject(files())
if (!loaded.ok) throw new Error(`fixture failed to load: ${loaded.errors.join(', ')}`)
export const d0: ProjectDoc = loaded.doc
