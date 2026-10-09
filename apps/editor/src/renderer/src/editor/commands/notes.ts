import { noteKey, notesOverlap, type Chart, type Note } from '@rcm/core'
import { getChart, replaceChart, type ProjectDoc } from '../state/doc'

/** 복사한 노트 묶음. 첫 노트의 tick이 0이 되도록 옮긴 사본이다. */
export interface Clip {
  notes: Note[]
}

const byTickLane = (a: Note, b: Note): number => a.tick - b.tick || a.lane - b.lane

function inRange(note: Note, lanes: number): boolean {
  if (!Number.isInteger(note.lane) || note.lane < 0 || note.lane >= lanes) return false
  if (!Number.isInteger(note.tick) || note.tick < 0) return false
  return note.type !== 'hold' || (Number.isInteger(note.endTick) && note.endTick > note.tick)
}

function shifted(note: Note, dTick: number, dLane: number): Note {
  const lane = note.lane + dLane
  return note.type === 'hold'
    ? { ...note, tick: note.tick + dTick, lane, endTick: note.endTick + dTick }
    : { ...note, tick: note.tick + dTick, lane }
}

/** moved를 chart의 나머지 노트(rest)에 합친다. 범위 위반이나 겹침이면 null. */
function merge(
  doc: ProjectDoc,
  file: string,
  chart: Chart,
  rest: Note[],
  moved: Note[]
): ProjectDoc | null {
  for (const n of moved) {
    if (!inRange(n, chart.lanes)) return null
    for (const o of rest) if (o.lane === n.lane && notesOverlap(o, n)) return null
  }
  const notes = [...rest, ...moved].sort(byTickLane)
  return replaceChart(doc, file, { ...chart, notes })
}

export function addNote(doc: ProjectDoc, file: string, note: Note): ProjectDoc | null {
  const chart = getChart(doc, file)
  return merge(doc, file, chart, chart.notes, [note])
}

export function removeNotes(
  doc: ProjectDoc,
  file: string,
  keys: ReadonlySet<string>
): ProjectDoc | null {
  const chart = getChart(doc, file)
  const notes = chart.notes.filter((n) => !keys.has(noteKey(n)))
  if (notes.length === chart.notes.length) return null
  return replaceChart(doc, file, { ...chart, notes })
}

function transform(
  doc: ProjectDoc,
  file: string,
  keys: ReadonlySet<string>,
  fn: (n: Note, lanes: number) => Note
): { doc: ProjectDoc; keys: Set<string> } | null {
  const chart = getChart(doc, file)
  const rest: Note[] = []
  const moved: Note[] = []
  for (const n of chart.notes) {
    if (keys.has(noteKey(n))) moved.push(fn(n, chart.lanes))
    else rest.push(n)
  }
  if (moved.length === 0) return null
  const next = merge(doc, file, chart, rest, moved)
  return next && { doc: next, keys: new Set(moved.map(noteKey)) }
}

export function moveNotes(
  doc: ProjectDoc,
  file: string,
  keys: ReadonlySet<string>,
  dTick: number,
  dLane: number
): { doc: ProjectDoc; keys: Set<string> } | null {
  return transform(doc, file, keys, (n) => shifted(n, dTick, dLane))
}

export function mirrorNotes(
  doc: ProjectDoc,
  file: string,
  keys: ReadonlySet<string>
): { doc: ProjectDoc; keys: Set<string> } | null {
  return transform(doc, file, keys, (n, lanes) => ({ ...n, lane: lanes - 1 - n.lane }))
}

export function copyNotes(chart: Chart, keys: ReadonlySet<string>): Clip | null {
  const picked = chart.notes.filter((n) => keys.has(noteKey(n))).sort(byTickLane)
  if (picked.length === 0) return null
  const base = picked[0].tick
  return { notes: picked.map((n) => shifted(n, -base, 0)) }
}

export function pasteClip(
  doc: ProjectDoc,
  file: string,
  clip: Clip,
  atTick: number
): { doc: ProjectDoc; keys: Set<string> } | null {
  if (clip.notes.length === 0) return null
  const chart = getChart(doc, file)
  const moved = clip.notes.map((n) => shifted(n, atTick, 0))
  const next = merge(doc, file, chart, chart.notes, moved)
  return next && { doc: next, keys: new Set(moved.map(noteKey)) }
}
