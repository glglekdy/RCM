import {
  DEFAULT_COLUMNS,
  MAX_COLUMNS,
  MIN_COLUMNS,
  freeNoteErrors,
  freeNoteHead,
  freeNoteKey,
  freeNotesOverlap,
  slideSpanAt,
  type FlickDirection,
  type FlickMode,
  type FreeChart,
  type FreeNote,
  type SlideEase,
  type SlidePoint
} from '@rcm/core'
import { getFreeChart, replaceChart, type ProjectDoc } from '../state/doc'

/** 자유형에서 그릴 노트 종류 */
export type FreeNoteType = 'tap' | 'trace' | 'flick' | 'slide'

/** 복사한 자유형 노트 묶음. 첫 노트의 tick이 0이 되도록 옮긴 사본이다. */
export interface FreeClip {
  kind: 'free'
  notes: FreeNote[]
}

/** 새 자유형 채보의 기본 플릭 방식 */
export const DEFAULT_FLICK_MODE: FlickMode = 'directional'
export const DEFAULT_FLICK_DIRECTION: FlickDirection = 'up'
export { DEFAULT_COLUMNS }

type Result = { doc: ProjectDoc; keys: Set<string> } | null

/** 시작 tick → 왼쪽 위치 순 (저장 순서와 같다) */
export function compareFreeNotes(a: FreeNote, b: FreeNote): number {
  const ha = freeNoteHead(a)
  const hb = freeNoteHead(b)
  return ha.tick - hb.tick || ha.x - hb.x
}

function valid(note: FreeNote, chart: FreeChart): boolean {
  return freeNoteErrors(note, chart.columns, chart.flickMode).length === 0
}

/** moved를 나머지 노트(rest)에 합친다. 규칙 위반이나 겹침(moved끼리 포함)이면 null. */
function merge(doc: ProjectDoc, file: string, chart: FreeChart, rest: FreeNote[], moved: FreeNote[]): ProjectDoc | null {
  for (let i = 0; i < moved.length; i++) {
    const n = moved[i]
    if (!valid(n, chart)) return null
    for (const o of rest) if (freeNotesOverlap(o, n)) return null
    for (let j = 0; j < i; j++) if (freeNotesOverlap(moved[j], n)) return null
  }
  const notes = [...rest, ...moved].sort(compareFreeNotes)
  return replaceChart(doc, file, { ...chart, notes })
}

export function addFreeNote(doc: ProjectDoc, file: string, note: FreeNote): ProjectDoc | null {
  const chart = getFreeChart(doc, file)
  return merge(doc, file, chart, chart.notes, [note])
}

/** 여러 노트를 한 번에 넣는다. 하나라도 규칙 위반이거나 겹치면 null. */
export function addFreeNotes(doc: ProjectDoc, file: string, notes: FreeNote[]): ProjectDoc | null {
  if (notes.length === 0) return null
  const chart = getFreeChart(doc, file)
  return merge(doc, file, chart, chart.notes, notes)
}

/**
 * 슬라이드 지점 중 앞뒤 지점을 잇는 직선 위에 있는 중간 지점을 뺀다 (직선 곡선·보이는 지점만).
 * 연속 그리기로 스냅마다 찍은 경로를 꺾이는 곳만 남게 줄인다.
 */
export function simplifySlidePoints(points: SlidePoint[], tickToMs: (tick: number) => number): SlidePoint[] {
  const out: SlidePoint[] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1]
    const p = points[i]
    const b = points[i + 1]
    const ta = tickToMs(a.tick)
    const t = (tickToMs(p.tick) - ta) / (tickToMs(b.tick) - ta)
    const onLine =
      !a.ease &&
      !p.ease &&
      !p.hidden &&
      Math.abs(a.x + (b.x - a.x) * t - p.x) < 1e-6 &&
      Math.abs(a.width + (b.width - a.width) * t - p.width) < 1e-6
    if (!onLine) out.push(p)
  }
  out.push(points[points.length - 1])
  return out
}

export function removeFreeNotes(doc: ProjectDoc, file: string, keys: ReadonlySet<string>): ProjectDoc | null {
  const chart = getFreeChart(doc, file)
  const notes = chart.notes.filter((n) => !keys.has(freeNoteKey(n)))
  if (notes.length === chart.notes.length) return null
  return replaceChart(doc, file, { ...chart, notes })
}

/** keys의 노트를 fn으로 바꾼다. fn이 null을 돌려주면 전체를 거부한다. 바뀐 노트의 새 키를 돌려준다. */
function transform(
  doc: ProjectDoc,
  file: string,
  keys: ReadonlySet<string>,
  fn: (n: FreeNote, chart: FreeChart) => FreeNote | null
): Result {
  const chart = getFreeChart(doc, file)
  const rest: FreeNote[] = []
  const moved: FreeNote[] = []
  for (const n of chart.notes) {
    if (!keys.has(freeNoteKey(n))) {
      rest.push(n)
      continue
    }
    const next = fn(n, chart)
    if (!next) return null
    moved.push(next)
  }
  if (moved.length === 0) return null
  const next = merge(doc, file, chart, rest, moved)
  return next && { doc: next, keys: new Set(moved.map(freeNoteKey)) }
}

/** tick과 가로 위치를 옮긴 사본. 슬라이드는 모든 지점을 함께 옮긴다. 범위는 검사하지 않는다. */
export function shiftFreeNote(note: FreeNote, dTick: number, dx: number): FreeNote {
  if (note.type === 'slide') {
    return { ...note, points: note.points.map((p) => ({ ...p, tick: p.tick + dTick, x: p.x + dx })) }
  }
  return { ...note, tick: note.tick + dTick, x: note.x + dx }
}

export function moveFreeNotes(doc: ProjectDoc, file: string, keys: ReadonlySet<string>, dTick: number, dx: number): Result {
  return transform(doc, file, keys, (n) => shiftFreeNote(n, dTick, dx))
}

/** 노트 하나를 next로 바꾼다 (폭 조절, 지점 편집 등). */
export function replaceFreeNote(doc: ProjectDoc, file: string, key: string, next: FreeNote): Result {
  return transform(doc, file, new Set([key]), () => next)
}

/** 좌우 반전: x → 칸 수 − x − width. */
export function mirroredFreeNote(note: FreeNote, columns: number): FreeNote {
  const flip = (dir: FlickDirection | undefined): FlickDirection | undefined =>
    dir === 'left' ? 'right' : dir === 'right' ? 'left' : dir === 'upLeft' ? 'upRight' : dir === 'upRight' ? 'upLeft' : dir
  const withDir = (n: FreeNote): FreeNote => {
    if ((n.type !== 'flick' && n.type !== 'slide') || n.direction === undefined) return n
    return { ...n, direction: flip(n.direction) }
  }
  if (note.type === 'slide') {
    return withDir({ ...note, points: note.points.map((p) => ({ ...p, x: columns - p.x - p.width })) })
  }
  return withDir({ ...note, x: columns - note.x - note.width })
}

export function mirrorFreeNotes(doc: ProjectDoc, file: string, keys: ReadonlySet<string>): Result {
  return transform(doc, file, keys, (n, chart) => mirroredFreeNote(n, chart.columns))
}

/** 가로 구간을 바꾼 사본. 슬라이드는 pointIndex 지점만 바꾼다. */
export function withSpan(note: FreeNote, x: number, width: number, pointIndex = 0): FreeNote {
  if (note.type !== 'slide') return { ...note, x, width }
  return { ...note, points: note.points.map((p, i) => (i === pointIndex ? { ...p, x, width } : p)) }
}

/** 폭을 바꾼 구간. 왼쪽 끝은 그대로 두되 칸을 넘으면 안쪽으로 민다. */
function resized<T extends { x: number; width: number }>(p: T, width: number, columns: number): T {
  const w = Math.min(width, columns)
  return { ...p, x: Math.max(0, Math.min(p.x, columns - w)), width: w }
}

/** 노트 폭을 바꾼다. 슬라이드는 모든 지점의 폭을 바꾼다. 0 이하면 null. */
export function setFreeNoteWidth(doc: ProjectDoc, file: string, keys: ReadonlySet<string>, width: number): Result {
  if (!Number.isFinite(width) || width <= 0) return null
  return transform(doc, file, keys, (n, chart) =>
    n.type === 'slide'
      ? { ...n, points: n.points.map((p) => resized(p, width, chart.columns)) }
      : resized(n, width, chart.columns)
  )
}

/** 탭·트레이스·플릭 사이에서 종류를 바꾼다. 슬라이드는 바꾸지 않는다. */
export function changeFreeType(
  doc: ProjectDoc,
  file: string,
  keys: ReadonlySet<string>,
  type: 'tap' | 'trace' | 'flick',
  direction: FlickDirection
): Result {
  return transform(doc, file, keys, (n, chart) => {
    if (n.type === 'slide') return n
    const base = { tick: n.tick, x: n.x, width: n.width }
    if (type !== 'flick') return { ...base, type }
    if (n.type === 'flick') return n
    return chart.flickMode === 'directional' ? { ...base, type, direction } : { ...base, type }
  })
}

/** 플릭 방향을 바꾼다 (플릭과 끝 플릭 슬라이드만). */
export function setFlickDirection(doc: ProjectDoc, file: string, keys: ReadonlySet<string>, direction: FlickDirection): Result {
  return transform(doc, file, keys, (n) =>
    n.type === 'flick' || (n.type === 'slide' && n.endFlick) ? { ...n, direction } : n
  )
}

/** 슬라이드 끝을 플릭으로 하거나 되돌린다. */
export function setSlideEndFlick(
  doc: ProjectDoc,
  file: string,
  key: string,
  endFlick: boolean,
  direction: FlickDirection
): Result {
  return transform(doc, file, new Set([key]), (n, chart) => {
    if (n.type !== 'slide') return null
    const { endFlick: _e, direction: _d, ...rest } = n
    if (!endFlick) return rest
    return chart.flickMode === 'directional' ? { ...rest, endFlick: true, direction } : { ...rest, endFlick: true }
  })
}

/** 슬라이드 시각 tick에 지점을 넣는다. 위치는 그 시각의 경로 위치. 같은 tick의 지점이 있거나 범위 밖이면 null. */
export function insertSlidePoint(
  doc: ProjectDoc,
  file: string,
  key: string,
  tick: number,
  tickToMs: (tick: number) => number
): (NonNullable<Result> & { index: number }) | null {
  const chart = getFreeChart(doc, file)
  const note = chart.notes.find((n) => freeNoteKey(n) === key)
  if (!note || note.type !== 'slide') return null
  const { points } = note
  if (tick <= points[0].tick || tick >= points[points.length - 1].tick) return null
  if (points.some((p) => p.tick === tick)) return null
  const index = points.findIndex((p) => p.tick > tick)
  const span = slideSpanAt(points, points.map((p) => tickToMs(p.tick)), tickToMs(tick))
  // 앞 지점의 곡선은 그대로 두고 새 지점은 직선으로 시작한다
  const point: SlidePoint = { tick, x: round(span.x), width: round(span.width) }
  const next: FreeNote = { ...note, points: [...points.slice(0, index), point, ...points.slice(index)] }
  const r = replaceFreeNote(doc, file, key, next)
  return r && { ...r, index }
}

/** 슬라이드 지점 하나를 옮긴 사본 (tick과 x). 지점 순서가 바뀌면 규칙 검사에서 거부된다. */
export function movedSlidePoint(note: FreeNote, index: number, tick: number, x: number): FreeNote {
  if (note.type !== 'slide') return note
  return { ...note, points: note.points.map((p, i) => (i === index ? { ...p, tick, x } : p)) }
}

/** 슬라이드 지점을 지운다. 지점이 2개뿐이면 null (슬라이드 전체를 지워야 한다). */
export function removeSlidePoint(doc: ProjectDoc, file: string, key: string, index: number): Result {
  return transform(doc, file, new Set([key]), (n) => {
    if (n.type !== 'slide' || n.points.length <= 2 || !n.points[index]) return null
    const points = n.points.filter((_, i) => i !== index)
    // 첫·끝 지점이 된 숨은 지점은 보이게 한다
    const fix = (p: SlidePoint): SlidePoint => {
      const { hidden: _h, ...rest } = p
      return rest
    }
    points[0] = fix(points[0])
    points[points.length - 1] = fix(points[points.length - 1])
    return { ...n, points }
  })
}

export function updateSlidePoint(
  doc: ProjectDoc,
  file: string,
  key: string,
  index: number,
  patch: { ease?: SlideEase; hidden?: boolean; width?: number }
): Result {
  if (patch.width !== undefined && !(Number.isFinite(patch.width) && patch.width > 0)) return null
  return transform(doc, file, new Set([key]), (n, chart) => {
    if (n.type !== 'slide' || !n.points[index]) return null
    const points = n.points.map((p, i) => {
      if (i !== index) return p
      const span = patch.width === undefined ? p : resized(p, patch.width, chart.columns)
      const next: SlidePoint = { tick: p.tick, x: span.x, width: span.width }
      const ease = patch.ease ?? p.ease
      const hidden = patch.hidden ?? p.hidden
      if (ease && ease !== 'linear') next.ease = ease
      if (hidden) next.hidden = true
      return next
    })
    return { ...n, points }
  })
}

/**
 * 칸 수와 플릭 방식을 바꾼다. 칸 수를 줄여 넘치는 노트가 생기면 null.
 * 플릭 방식을 바꾸면 방향을 지우거나(any) 기본 방향을 채운다(directional).
 */
export function updateFreeSettings(
  doc: ProjectDoc,
  file: string,
  patch: { columns?: number; flickMode?: FlickMode }
): ProjectDoc | null {
  const chart = getFreeChart(doc, file)
  const columns = patch.columns ?? chart.columns
  const flickMode = patch.flickMode ?? chart.flickMode
  if (!Number.isInteger(columns) || columns < MIN_COLUMNS || columns > MAX_COLUMNS) return null
  if (columns === chart.columns && flickMode === chart.flickMode) return null
  const notes = chart.notes.map((n) => {
    const flick = n.type === 'flick' || (n.type === 'slide' && n.endFlick)
    if (!flick || flickMode === chart.flickMode) return n
    if (flickMode === 'any') {
      const { direction: _d, ...rest } = n as FreeNote & { direction?: FlickDirection }
      return rest as FreeNote
    }
    return { ...n, direction: DEFAULT_FLICK_DIRECTION }
  })
  const next: FreeChart = { ...chart, columns, flickMode, notes }
  if (notes.some((n) => !valid(n, next))) return null
  return replaceChart(doc, file, next)
}

export function copyFreeNotes(chart: FreeChart, keys: ReadonlySet<string>): FreeClip | null {
  const picked = chart.notes.filter((n) => keys.has(freeNoteKey(n))).sort(compareFreeNotes)
  if (picked.length === 0) return null
  const base = freeNoteHead(picked[0]).tick
  return { kind: 'free', notes: picked.map((n) => shiftFreeNote(n, -base, 0)) }
}

/** 클립을 atTick에 붙인다. 칸 밖이거나 겹치면 null. 플릭 방향은 붙일 채보의 방식에 맞춘다. */
export function pasteFreeClip(doc: ProjectDoc, file: string, clip: FreeClip, atTick: number): Result {
  if (clip.notes.length === 0) return null
  const chart = getFreeChart(doc, file)
  const moved = clip.notes.map((n) => adaptFlick(shiftFreeNote(n, atTick, 0), chart.flickMode))
  const next = merge(doc, file, chart, chart.notes, moved)
  return next && { doc: next, keys: new Set(moved.map(freeNoteKey)) }
}

function adaptFlick(n: FreeNote, mode: FlickMode): FreeNote {
  const flick = n.type === 'flick' || (n.type === 'slide' && n.endFlick)
  if (!flick) return n
  if (mode === 'any') {
    const { direction: _d, ...rest } = n as FreeNote & { direction?: FlickDirection }
    return rest as FreeNote
  }
  return (n as { direction?: FlickDirection }).direction ? n : { ...n, direction: DEFAULT_FLICK_DIRECTION }
}

/** 화면에서 계산한 위치의 부동소수 오차를 정리한다 (1/100칸). */
function round(v: number): number {
  return Math.round(v * 100) / 100
}
