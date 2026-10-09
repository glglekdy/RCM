import { describe, expect, it } from 'vitest'
import { TimingMap } from '@rcm/core'
import { d0, withNotes } from '../fixtures'
import { mergeRecorded, quantizePresses } from '../../../src/renderer/src/editor/commands/record'

// d0: 120 BPM, offset 0 → 1 tick = 500/480 ms, 1/16 한 칸 = 120 tick = 125ms
const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0)

describe('recording commands', () => {
  it('스냅 정렬, 짧으면 tap, 한 칸 이상이면 hold', () => {
    expect(quantizePresses([{ lane: 0, downMs: 510, upMs: 560 }], tm, 16)).toEqual([
      { tick: 480, lane: 0, type: 'tap' }
    ])
    expect(quantizePresses([{ lane: 1, downMs: 500, upMs: 1000 }], tm, 16)).toEqual([
      { tick: 480, lane: 1, type: 'hold', endTick: 960 }
    ])
  })
  it('음수 tick 버림', () =>
    expect(quantizePresses([{ lane: 0, downMs: -300, upMs: -250 }], tm, 16)).toEqual([]))
  it('겹치면 기존 유지', () => {
    const d = withNotes(d0, [{ tick: 480, lane: 0, type: 'tap' }])
    const r = mergeRecorded(d, 'normal.chart.json', [
      { tick: 480, lane: 0, type: 'tap' },
      { tick: 480, lane: 1, type: 'tap' },
      { tick: 480, lane: 1, type: 'tap' }
    ])
    expect(r.added).toBe(1)
    expect(r.dropped).toBe(2)
  })
})
