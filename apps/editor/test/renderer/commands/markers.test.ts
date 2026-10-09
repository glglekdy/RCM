import { describe, expect, it } from 'vitest'
import {
  addMarker,
  markerAtY,
  neighborMarkerMs,
  removeMarker,
  renameMarker
} from '../../../src/renderer/src/editor/commands/markers'
import { d0 } from '../fixtures'

describe('marker commands', () => {
  it('정렬 삽입', () => {
    const d = addMarker(addMarker(d0, 500), 100)
    expect(d.editorData.markers.map((m) => m.ms)).toEqual([100, 500])
    expect(d.charts).toBe(d0.charts)
    expect(d.song).toBe(d0.song)
    expect(d.editorData).not.toBe(d0.editorData)
  })
  it('삭제와 이름 변경', () => {
    const d = addMarker(addMarker(d0, 500), 100)
    expect(removeMarker(d, 5)).toBeNull()
    expect(removeMarker(d, 0)?.editorData.markers.map((m) => m.ms)).toEqual([500])
    expect(renameMarker(d, -1, 'x')).toBeNull()
    const r = renameMarker(d, 1, '후렴')
    expect(r?.editorData.markers[1]).toEqual({ ms: 500, label: '후렴' })
    expect(d.editorData.markers[1].label).toBe('')
  })
  it('이웃 마커', () => {
    const ms = [
      { ms: 100, label: '' },
      { ms: 500, label: '' }
    ]
    expect(neighborMarkerMs(ms, 100, 1)).toBe(500)
    expect(neighborMarkerMs(ms, 100.5, -1)).toBeNull()
    expect(neighborMarkerMs(ms, 300, -1)).toBe(100)
  })
  it('Y 위치로 찾기', () => {
    const v = { playheadMs: 0, pxPerMs: 1, height: 800 }
    expect(markerAtY([{ ms: 100, label: '' }], v, 600 - 100 + 3)).toBe(0)
    expect(markerAtY([{ ms: 100, label: '' }], v, 600 - 100 + 10)).toBe(-1)
  })
})
