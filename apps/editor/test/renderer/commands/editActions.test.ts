import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TimingMap, type Note } from '@rcm/core'
import { runEditAction } from '../../../src/renderer/src/editor/commands/editActions'
import { getChart } from '../../../src/renderer/src/editor/state/doc'
import { History } from '../../../src/renderer/src/editor/state/history'
import { EditorStore } from '../../../src/renderer/src/editor/state/store'
import { d0, withNotes } from '../fixtures'

const F = 'normal.chart.json'
const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0) // 1 tick = 500/480 ms
const tap = (tick: number, lane: number): Note => ({ tick, lane, type: 'tap' })
const start = [tap(0, 0), tap(480, 1)]

const commit = vi.spyOn(History.prototype, 'commit')

beforeEach(() => {
  ;(globalThis as unknown as { window: unknown }).window = { rcm: { setDirty: vi.fn() } }
  commit.mockClear()
})

function setup(notes: Note[] = start) {
  const store = new EditorStore({ dir: 'C:/p', audioPath: 'C:/p/audio.ogg' }, withNotes(d0, notes))
  store.set({ snap: 4, selection: new Set(['0:0', '1:480']) })
  const state = () => store.getState()
  const keys = () => getChart(state().doc, F).notes.map((n) => `${n.lane}:${n.tick}`)
  const labels = () => commit.mock.calls.map(([entry]) => entry.label)
  return { store, state, keys, labels }
}

describe('편집 동작', () => {
  it('복사: 클립보드 저장 + 토스트, 선택이 없으면 아무 일 없음', () => {
    const { store, state } = setup()
    expect(runEditAction(store, 'copy', tm)).toBe('2개 복사')
    expect(state().clipboard).toEqual({ notes: [tap(0, 0), tap(480, 1)] })
    store.set({ selection: new Set(), clipboard: null })
    expect(runEditAction(store, 'copy', tm)).toBeNull()
    expect(state().clipboard).toBeNull()
    expect(commit).not.toHaveBeenCalled()
  })

  it('잘라내기: 복사 + 삭제, 토스트 N개 잘라냄', () => {
    const { store, state, keys, labels } = setup()
    expect(runEditAction(store, 'cut', tm)).toBe('2개 잘라냄')
    expect(state().clipboard?.notes).toHaveLength(2)
    expect(keys()).toEqual([])
    expect(labels()).toEqual(['잘라내기'])
    expect(state().selection.size).toBe(0)
  })

  it('붙여넣기: 재생선 위치를 스냅한 tick에 붙이고 붙인 노트를 선택', () => {
    const { store, state, keys, labels } = setup()
    runEditAction(store, 'copy', tm)
    // tick 1500 → 1/4 스냅이면 1440
    store.set({ playheadMs: tm.tickToMs(1500) })
    expect(runEditAction(store, 'paste', tm)).toBeNull()
    expect(keys()).toEqual(['0:0', '1:480', '0:1440', '1:1920'])
    expect(labels()).toEqual(['붙여넣기'])
    expect([...state().selection].sort()).toEqual(['0:1440', '1:1920'])
  })

  it('붙여넣기: 곡 시작 전 재생선은 tick 0, 겹치면 토스트만', () => {
    const { store, keys } = setup([tap(480, 1)])
    store.set({ clipboard: { notes: [tap(0, 0)] }, playheadMs: -1500 })
    expect(runEditAction(store, 'paste', tm)).toBeNull()
    expect(keys()).toEqual(['0:0', '1:480'])
    store.set({ clipboard: { notes: [tap(0, 1)] }, playheadMs: tm.tickToMs(480) })
    expect(runEditAction(store, 'paste', tm)).toBe(
      '여기에는 붙여넣을 수 없어요 (겹치거나 레인 수가 달라요)'
    )
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('삭제와 좌우 반전', () => {
    const { store, state, keys, labels } = setup()
    expect(runEditAction(store, 'mirror', tm)).toBeNull()
    expect(keys()).toEqual(['3:0', '2:480'])
    expect([...state().selection].sort()).toEqual(['2:480', '3:0'])
    expect(runEditAction(store, 'delete', tm)).toBeNull()
    expect(keys()).toEqual([])
    expect(state().selection.size).toBe(0)
    expect(labels()).toEqual(['좌우 반전', '노트 삭제'])
  })

  it('재생 중에는 잘라내기·붙여넣기·삭제·반전이 아무 일도 하지 않는다 (복사는 허용)', () => {
    const { store, state, keys } = setup()
    store.set({ playing: true, clipboard: { notes: [tap(0, 2)] }, playheadMs: tm.tickToMs(960) })
    for (const action of ['cut', 'paste', 'delete', 'mirror'] as const) {
      expect(runEditAction(store, action, tm)).toBeNull()
    }
    expect(keys()).toEqual(['0:0', '1:480'])
    expect(state().clipboard).toEqual({ notes: [tap(0, 2)] })
    expect(commit).not.toHaveBeenCalled()
    expect(runEditAction(store, 'copy', tm)).toBe('2개 복사')
  })
})
