import {
  compareNotes,
  noteKey,
  notesOverlap,
  trackIndex,
  type Chart,
  type Note,
  type Track
} from '@rcm/core'
import { getChart, replaceChart, type ProjectDoc } from '../state/doc'

/** 복사한 노트 묶음. 첫 노트의 tick이 0이 되도록 옮긴 사본이다. */
export interface Clip {
  notes: Note[]
}

function inRange(note: Note, tracks: readonly Track[]): boolean {
  if (trackIndex(tracks, note.track) < 0) return false
  if (!Number.isInteger(note.tick) || note.tick < 0) return false
  return note.type !== 'hold' || (Number.isInteger(note.endTick) && note.endTick > note.tick)
}

/**
 * tick을 옮기고 트랙 위치를 dLane만큼 옮긴 사본. 옮긴 트랙 위치가 `tracks` 밖이면 null.
 * tick 범위는 검사하지 않는다.
 */
export function shiftNote(note: Note, dTick: number, dLane: number, tracks: readonly Track[]): Note | null {
  const from = trackIndex(tracks, note.track)
  if (from < 0) return null
  const to = tracks[from + dLane]
  if (!to) return null
  const track = to.id
  return note.type === 'hold'
    ? { ...note, tick: note.tick + dTick, track, endTick: note.endTick + dTick }
    : { ...note, tick: note.tick + dTick, track }
}

/** tick만 옮긴 사본. */
function shiftTick(note: Note, dTick: number): Note {
  return note.type === 'hold'
    ? { ...note, tick: note.tick + dTick, endTick: note.endTick + dTick }
    : { ...note, tick: note.tick + dTick }
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
    if (!inRange(n, chart.tracks)) return null
    for (const o of rest) if (notesOverlap(o, n)) return null
  }
  const notes = [...rest, ...moved].sort(compareNotes(chart.tracks))
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

/** keys의 노트를 fn으로 바꾼다. fn이 null을 돌려주면(트랙 밖) 전체를 거부한다. */
function transform(
  doc: ProjectDoc,
  file: string,
  keys: ReadonlySet<string>,
  fn: (n: Note, tracks: readonly Track[]) => Note | null
): { doc: ProjectDoc; keys: Set<string> } | null {
  const chart = getChart(doc, file)
  const rest: Note[] = []
  const moved: Note[] = []
  for (const n of chart.notes) {
    if (!keys.has(noteKey(n))) {
      rest.push(n)
      continue
    }
    const next = fn(n, chart.tracks)
    if (!next) return null
    moved.push(next)
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
  return transform(doc, file, keys, (n, tracks) => shiftNote(n, dTick, dLane, tracks))
}

/**
 * 롱노트 하나의 끝 tick을 바꾼다. endTick이 머리보다 위가 아니면 tap이 된다 (그리기와 같다).
 * 겹치거나 범위 밖이면 null.
 */
export function resizeHold(
  doc: ProjectDoc,
  file: string,
  key: string,
  endTick: number
): { doc: ProjectDoc; keys: Set<string> } | null {
  return transform(doc, file, new Set([key]), (n) => resizedHold(n, endTick))
}

/** 롱노트의 끝을 endTick으로 바꾼 사본 (머리 이하면 tap). */
export function resizedHold(note: Note, endTick: number): Note {
  return endTick > note.tick
    ? { tick: note.tick, track: note.track, type: 'hold', endTick }
    : { tick: note.tick, track: note.track, type: 'tap' }
}

/** 트랙 위치 i의 노트를 위치 n−1−i의 트랙으로 옮긴다. */
export function mirrorNotes(
  doc: ProjectDoc,
  file: string,
  keys: ReadonlySet<string>
): { doc: ProjectDoc; keys: Set<string> } | null {
  return transform(doc, file, keys, (n, tracks) => {
    const i = trackIndex(tracks, n.track)
    return i < 0 ? null : { ...n, track: tracks[tracks.length - 1 - i].id }
  })
}

export function copyNotes(chart: Chart, keys: ReadonlySet<string>): Clip | null {
  const picked = chart.notes.filter((n) => keys.has(noteKey(n))).sort(compareNotes(chart.tracks))
  if (picked.length === 0) return null
  const base = picked[0].tick
  return { notes: picked.map((n) => shiftTick(n, -base)) }
}

/** 클립을 atTick에 붙인다. 클립 노트의 트랙이 채보에 하나라도 없거나 겹치면 null. */
export function pasteClip(
  doc: ProjectDoc,
  file: string,
  clip: Clip,
  atTick: number
): { doc: ProjectDoc; keys: Set<string> } | null {
  if (clip.notes.length === 0) return null
  const chart = getChart(doc, file)
  const moved = clip.notes.map((n) => shiftTick(n, atTick))
  const next = merge(doc, file, chart, chart.notes, moved)
  return next && { doc: next, keys: new Set(moved.map(noteKey)) }
}
