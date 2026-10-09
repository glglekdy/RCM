import { describe, expect, it } from 'vitest'
import { TimingMap } from '@rcm/core'
import type { Chart } from '@rcm/core'
import {
  collectDueHits,
  hitTimesForChart,
  playbackStartParams
} from '../../../src/renderer/src/editor/audio/schedule'

describe('schedule', () => {
  it('음수 위치에서 재생 시작', () => {
    expect(playbackStartParams(-1500)).toEqual({ delaySec: 1.5, offsetSec: 0 })
    expect(playbackStartParams(2000)).toEqual({ delaySec: 0, offsetSec: 2 })
  })

  it('hit 시각: 시작 ms, 정렬, 중복 제거', () => {
    const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0)
    const chart = {
      formatVersion: 1,
      name: 'n',
      level: 1,
      lanes: 4,
      notes: [
        { tick: 480, lane: 1, type: 'tap' },
        { tick: 0, lane: 0, type: 'hold', endTick: 960 },
        { tick: 480, lane: 2, type: 'tap' }
      ]
    } as Chart
    expect(hitTimesForChart(chart, tm)).toEqual([0, 500])
  })

  it('due hits', () => {
    const hits = [0, 100, 200, 300]
    expect(collectDueHits(hits, 0, 50, 250)).toEqual({ due: [100, 200], cursor: 3 })
    expect(collectDueHits(hits, 3, 250, 350)).toEqual({ due: [300], cursor: 4 })
  })
})
