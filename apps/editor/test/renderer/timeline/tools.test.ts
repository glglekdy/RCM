import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TimingMap, type Note } from '@rcm/core'
import { getChart, type ProjectDoc } from '../../../src/renderer/src/editor/state/doc'
import { History } from '../../../src/renderer/src/editor/state/history'
import { EditorStore } from '../../../src/renderer/src/editor/state/store'
import { createToolController } from '../../../src/renderer/src/editor/timeline/tools'
import { layoutTimeline } from '../../../src/renderer/src/editor/timeline/view'
import { d0, withNotes } from '../fixtures'

const F = 'normal.chart.json'
const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0)
const view = { playheadMs: 0, pxPerMs: 0.48, height: 800 } // 1 tick = 0.5px, tick 0 → y 600
const layout = layoutTimeline(1000, 4) // lane 0: 404~452, lane 1: 452~500
const X0 = 428
const X1 = 476
const yOf = (tick: number) => 600 - tick / 2
const left = (x: number, y: number) => ({ x, y, button: 0 })
const right = (x: number, y: number) => ({ x, y, button: 2 })
const tap = (tick: number, lane: number): Note => ({ tick, lane, type: 'tap' })

const commit = vi.spyOn(History.prototype, 'commit')

beforeEach(() => {
  ;(globalThis as unknown as { window: unknown }).window = { rcm: { setDirty: vi.fn() } }
  commit.mockClear()
})

function setup(doc: ProjectDoc = d0, tool: 'draw' | 'erase' | 'select' = 'draw') {
  const store = new EditorStore({ dir: 'C:/p', audioPath: 'C:/p/audio.ogg' }, doc)
  store.set({ tool, snap: 4 })
  const tools = createToolController(store, () => ({ tm, view, layout }))
  const notes = () => getChart(store.getState().doc, F).notes
  const labels = () => commit.mock.calls.map(([entry]) => entry.label)
  return { store, tools, notes, labels }
}

describe('그리기 도구', () => {
  it('클릭하면 스냅 셀에 tap', () => {
    const { tools, notes, labels } = setup()
    tools.onPointerDown(left(X1, yOf(500)))
    expect(tools.overlay().preview).toEqual(tap(480, 1))
    tools.onPointerUp(left(X1, yOf(500)))
    expect(notes()).toEqual([tap(480, 1)])
    expect(labels()).toEqual(['노트 추가'])
    expect(tools.overlay().preview).toBeNull()
  })

  it('위로 끌면 hold, 다른 레인으로 가도 시작 레인 유지', () => {
    const { tools, notes } = setup()
    tools.onPointerDown(left(X0, yOf(0)))
    tools.onPointerMove(left(X1, yOf(960)))
    expect(tools.overlay().preview).toEqual({ tick: 0, lane: 0, type: 'hold', endTick: 960 })
    tools.onPointerUp(left(X1, yOf(960)))
    expect(notes()).toEqual([{ tick: 0, lane: 0, type: 'hold', endTick: 960 }])
  })

  it('아래로 끌면 tap', () => {
    const { tools, notes } = setup()
    tools.onPointerDown(left(X0, yOf(960)))
    tools.onPointerMove(left(X0, yOf(0)))
    expect(tools.overlay().preview).toEqual(tap(960, 0))
    tools.onPointerUp(left(X0, yOf(0)))
    expect(notes()).toEqual([tap(960, 0)])
  })

  it('이미 노트가 있는 자리와 겹치는 hold는 무시', () => {
    const { tools, notes } = setup(withNotes(d0, [tap(480, 0)]))
    tools.onPointerDown(left(X0, yOf(480)))
    expect(tools.overlay().preview).toBeNull()
    tools.onPointerUp(left(X0, yOf(480)))
    tools.onPointerDown(left(X0, yOf(0)))
    tools.onPointerMove(left(X0, yOf(960)))
    tools.onPointerUp(left(X0, yOf(960)))
    expect(notes()).toEqual([tap(480, 0)])
    expect(commit).not.toHaveBeenCalled()
  })

  it('Escape(cancel)로 드래그 취소', () => {
    const { tools, notes } = setup()
    tools.onPointerDown(left(X0, yOf(0)))
    tools.onPointerMove(left(X0, yOf(960)))
    tools.cancel()
    expect(tools.overlay().preview).toBeNull()
    tools.onPointerUp(left(X0, yOf(960)))
    expect(notes()).toEqual([])
  })

  it('재생 중에는 무시', () => {
    const { store, tools, notes } = setup()
    store.set({ playing: true })
    tools.onPointerDown(left(X0, yOf(0)))
    tools.onPointerUp(left(X0, yOf(0)))
    expect(notes()).toEqual([])
  })

  it('선택 도구에서는 좌클릭이 노트를 만들지 않는다', () => {
    const { tools, notes } = setup(d0, 'select')
    tools.onPointerDown(left(X0, yOf(0)))
    tools.onPointerUp(left(X0, yOf(0)))
    expect(notes()).toEqual([])
  })
})

describe('우클릭', () => {
  it('레인 안: 노트 삭제 (모든 도구)', () => {
    const { tools, notes, labels } = setup(withNotes(d0, [tap(0, 0), tap(480, 1)]), 'select')
    tools.onContextMenu(right(X1, yOf(480) + 3))
    expect(notes()).toEqual([tap(0, 0)])
    expect(labels()).toEqual(['노트 삭제'])
  })

  it('레인 안 빈 곳은 아무 일도 없음', () => {
    const { tools, notes } = setup(withNotes(d0, [tap(0, 0)]))
    tools.onContextMenu(right(X1, yOf(0)))
    expect(notes()).toEqual([tap(0, 0)])
    expect(commit).not.toHaveBeenCalled()
  })

  it('레인 밖: 마커 삭제', () => {
    const doc: ProjectDoc = {
      ...d0,
      editorData: { ...d0.editorData, markers: [{ ms: 0, label: '' }] }
    }
    const { store, tools, labels } = setup(doc)
    tools.onContextMenu(right(layout.waveX + 10, 600))
    expect(store.getState().doc.editorData.markers).toEqual([])
    expect(labels()).toEqual(['마커 삭제'])
  })
})

describe('지우기 도구', () => {
  it('드래그로 지나간 노트를 숨기고 놓을 때 한 번에 삭제', () => {
    const start = [tap(0, 0), tap(480, 0), tap(240, 1)]
    const { store, tools, notes, labels } = setup(withNotes(d0, start), 'erase')
    tools.onPointerDown(left(X0, yOf(0)))
    // 한 번에 크게 움직여도 사이에 있는 노트(tick 480 = y 360)를 놓치지 않는다
    tools.onPointerMove(left(X0, yOf(600)))
    expect([...tools.overlay().hiddenKeys].sort()).toEqual(['0:0', '0:480'])
    expect(notes()).toEqual(start)
    tools.onPointerUp(left(X0, yOf(600)))
    expect(notes()).toEqual([tap(240, 1)])
    expect(labels()).toEqual(['노트 지우기'])
    expect(tools.overlay().hiddenKeys.size).toBe(0)
    store.undo()
    expect(notes()).toEqual(start)
  })

  it('아무것도 지나지 않으면 기록 없음', () => {
    const { tools } = setup(withNotes(d0, [tap(0, 1)]), 'erase')
    tools.onPointerDown(left(X0, yOf(0)))
    tools.onPointerUp(left(X0, yOf(0)))
    expect(commit).not.toHaveBeenCalled()
  })
})
