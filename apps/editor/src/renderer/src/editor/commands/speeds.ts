import {
  MAX_SCROLL_SPEED,
  MIN_SCROLL_SPEED,
  ScrollMap,
  type Chart,
  type SpeedEase,
  type SpeedPoint,
  type TimingMap
} from '@rcm/core'
import { getChart, replaceChart, type ProjectDoc } from '../state/doc'

function validSpeed(speed: number): boolean {
  return Number.isFinite(speed) && speed >= MIN_SCROLL_SPEED && speed <= MAX_SCROLL_SPEED
}

/** speeds만 바꾼 차트로 교체한다. 비면 필드 자체를 뺀다. */
function withSpeeds(doc: ProjectDoc, file: string, speeds: SpeedPoint[]): ProjectDoc {
  const { speeds: _old, ...rest } = getChart(doc, file)
  const chart: Chart = speeds.length > 0 ? { ...rest, speeds } : rest
  return replaceChart(doc, file, chart)
}

/** tick 위치에 속도 지점을 정렬 위치로 넣는다. 같은 tick이 있거나 범위 밖이면 null. */
export function addSpeedPoint(
  doc: ProjectDoc,
  file: string,
  tick: number,
  speed: number
): ProjectDoc | null {
  if (!Number.isInteger(tick) || tick < 0 || !validSpeed(speed)) return null
  const cur = getChart(doc, file).speeds ?? []
  if (cur.some((p) => p.tick === tick)) return null
  return withSpeeds(doc, file, [...cur, { tick, speed }].sort((a, b) => a.tick - b.tick))
}

export function updateSpeedPoint(
  doc: ProjectDoc,
  file: string,
  index: number,
  patch: { speed?: number; ease?: SpeedEase }
): ProjectDoc | null {
  const cur = getChart(doc, file).speeds ?? []
  if (!Number.isInteger(index) || index < 0 || index >= cur.length) return null
  if (patch.speed !== undefined && !validSpeed(patch.speed)) return null
  if (patch.ease !== undefined && patch.ease !== 'instant' && patch.ease !== 'linear') return null
  const old = cur[index]
  const speed = patch.speed ?? old.speed
  const ease = patch.ease ?? old.ease ?? 'instant'
  if (speed === old.speed && ease === (old.ease ?? 'instant')) return null
  const next: SpeedPoint = ease === 'instant' ? { tick: old.tick, speed } : { tick: old.tick, speed, ease }
  return withSpeeds(doc, file, cur.map((p, i) => (i === index ? next : p)))
}

export function removeSpeedPoint(doc: ProjectDoc, file: string, index: number): ProjectDoc | null {
  const cur = getChart(doc, file).speeds ?? []
  if (!Number.isInteger(index) || index < 0 || index >= cur.length) return null
  return withSpeeds(doc, file, cur.filter((_, i) => i !== index))
}

/** 새 속도 지점의 기본 배율: 그 위치의 현재 속도 (소수 둘째 자리 반올림). */
export function defaultSpeedAt(chart: Chart, tm: TimingMap, tick: number): number {
  const speed = new ScrollMap(chart.speeds, tm).speedAt(tm.tickToMs(tick))
  return Math.round(speed * 100) / 100
}
