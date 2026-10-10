import {
  DEFAULT_NOTE_COLOR,
  MAX_TRACKS,
  MIN_TRACKS,
  TRACK_COLOR_PATTERN,
  compareNotes,
  isValidTrackId,
  nextTrackId,
  type Chart,
  type Track,
  type TrackWidth
} from '@rcm/core'
import { getChart, replaceChart, type ProjectDoc } from '../state/doc'

const WIDTHS: readonly TrackWidth[] = ['narrow', 'normal', 'wide']

const validIndex = (tracks: readonly Track[], i: number): boolean =>
  Number.isInteger(i) && i >= 0 && i < tracks.length

/** 끝에 `Note_N` 트랙을 추가한다. 이미 최대 개수면 null. */
export function addTrack(doc: ProjectDoc, file: string): ProjectDoc | null {
  const chart = getChart(doc, file)
  if (chart.tracks.length >= MAX_TRACKS) return null
  return replaceChart(doc, file, { ...chart, tracks: [...chart.tracks, { id: nextTrackId(chart.tracks) }] })
}

/** 트랙 이름을 바꾸고 그 트랙 노트의 `track`도 바꾼다. 형식이 틀리거나 이미 있는 이름(같은 이름 포함)이면 null. */
export function renameTrack(doc: ProjectDoc, file: string, index: number, id: string): ProjectDoc | null {
  const chart = getChart(doc, file)
  if (!validIndex(chart.tracks, index) || !isValidTrackId(id)) return null
  if (chart.tracks.some((t) => t.id === id)) return null
  const old = chart.tracks[index].id
  const tracks = chart.tracks.map((t, i) => (i === index ? { ...t, id } : t))
  const notes = chart.notes.map((n) => (n.track === old ? { ...n, track: id } : n))
  return replaceChart(doc, file, { ...chart, tracks, notes })
}

/** from 위치의 트랙을 to 위치(옮긴 뒤 위치)로 옮긴다. 노트는 그대로 두고 정렬만 다시 한다. */
export function moveTrack(doc: ProjectDoc, file: string, from: number, to: number): ProjectDoc | null {
  const chart = getChart(doc, file)
  if (from === to || !validIndex(chart.tracks, from) || !validIndex(chart.tracks, to)) return null
  const tracks = [...chart.tracks]
  const [moved] = tracks.splice(from, 1)
  tracks.splice(to, 0, moved)
  const notes = [...chart.notes].sort(compareNotes(tracks))
  return replaceChart(doc, file, { ...chart, tracks, notes })
}

/**
 * 트랙 색·폭을 바꾼다. 형식이 틀리거나 바뀌는 것이 없으면(색은 대소문자 무관) null.
 * 기본값(`#f2f2f2`, `normal`)이 되면 그 필드를 지운다.
 */
export function updateTrackLook(
  doc: ProjectDoc,
  file: string,
  index: number,
  patch: { color?: string; width?: TrackWidth }
): ProjectDoc | null {
  const chart = getChart(doc, file)
  if (!validIndex(chart.tracks, index)) return null
  if (patch.color !== undefined && !TRACK_COLOR_PATTERN.test(patch.color)) return null
  if (patch.width !== undefined && !WIDTHS.includes(patch.width)) return null
  const cur = chart.tracks[index]
  const next: Track = { ...cur, ...patch }
  const colorOf = (t: Track) => (t.color ?? DEFAULT_NOTE_COLOR).toLowerCase()
  if (colorOf(next) === colorOf(cur) && (next.width ?? 'normal') === (cur.width ?? 'normal')) return null
  if (next.color !== undefined && next.color.toLowerCase() === DEFAULT_NOTE_COLOR) delete next.color
  if (next.width === 'normal') delete next.width
  const tracks = chart.tracks.map((t, i) => (i === index ? next : t))
  return replaceChart(doc, file, { ...chart, tracks })
}

/** 트랙과 그 트랙의 노트를 지운다. removed는 지운 노트 수. 마지막 트랙이면 null. */
export function removeTrack(
  doc: ProjectDoc,
  file: string,
  index: number
): { doc: ProjectDoc; removed: number } | null {
  const chart = getChart(doc, file)
  if (chart.tracks.length <= MIN_TRACKS || !validIndex(chart.tracks, index)) return null
  const id = chart.tracks[index].id
  const tracks = chart.tracks.filter((_, i) => i !== index)
  const notes = chart.notes.filter((n) => n.track !== id)
  return {
    doc: replaceChart(doc, file, { ...chart, tracks, notes }),
    removed: chart.notes.length - notes.length
  }
}

export function notesOnTrack(chart: Chart, id: string): number {
  return chart.notes.filter((n) => n.track === id).length
}
