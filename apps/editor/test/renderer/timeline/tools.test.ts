import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TimingMap, basicTracks, type Note } from '@rcm/core'
import { getChart, type ProjectDoc } from '../../../src/renderer/src/editor/state/doc'
import { History } from '../../../src/renderer/src/editor/state/history'
import { EditorStore } from '../../../src/renderer/src/editor/state/store'
import { createToolController } from '../../../src/renderer/src/editor/timeline/tools'
import { layoutTimeline } from '../../../src/renderer/src/editor/timeline/view'
import { d0, withNotes } from '../fixtures'

const F = 'normal.chart.json'
const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0)
const view = { playheadMs: 0, pxPerMs: 0.48, height: 800 } // 1 tick = 0.5px, tick 0 → y 600
const layout = layoutTimeline(1000, basicTracks(4)) // Note_1: 404~452, Note_2: 452~500
const X0 = 428
const X1 = 476
const X2 = 524
const yOf = (tick: number) => 600 - tick / 2
const left = (x: number, y: number, shift = false) => ({ x, y, button: 0, shift })
const right = (x: number, y: number) => ({ x, y, button: 2, shift: false })
const tap = (tick: number, track: string): Note => ({ tick, track, type: 'tap' })

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
    expect(tools.overlay().preview).toEqual([tap(480, 'Note_2')])
    tools.onPointerUp(left(X1, yOf(500)))
    expect(notes()).toEqual([tap(480, 'Note_2')])
    expect(labels()).toEqual(['노트 추가'])
    expect(tools.overlay().preview).toEqual([])
  })

  it('위로 끌면 hold, 다른 레인으로 가도 시작 레인 유지', () => {
    const { tools, notes } = setup()
    tools.onPointerDown(left(X0, yOf(0)))
    tools.onPointerMove(left(X1, yOf(960)))
    expect(tools.overlay().preview).toEqual([{ tick: 0, track: 'Note_1', type: 'hold', endTick: 960 }])
    tools.onPointerUp(left(X1, yOf(960)))
    expect(notes()).toEqual([{ tick: 0, track: 'Note_1', type: 'hold', endTick: 960 }])
  })

  it('아래로 끌면 tap', () => {
    const { tools, notes } = setup()
    tools.onPointerDown(left(X0, yOf(960)))
    tools.onPointerMove(left(X0, yOf(0)))
    expect(tools.overlay().preview).toEqual([tap(960, 'Note_1')])
    tools.onPointerUp(left(X0, yOf(0)))
    expect(notes()).toEqual([tap(960, 'Note_1')])
  })

  it('이미 노트가 있는 자리와 겹치는 hold는 무시', () => {
    const { tools, notes } = setup(withNotes(d0, [tap(480, 'Note_1')]))
    tools.onPointerDown(left(X0, yOf(480)))
    expect(tools.overlay().preview).toEqual([])
    tools.onPointerUp(left(X0, yOf(480)))
    tools.onPointerDown(left(X0, yOf(0)))
    tools.onPointerMove(left(X0, yOf(960)))
    tools.onPointerUp(left(X0, yOf(960)))
    expect(notes()).toEqual([tap(480, 'Note_1')])
    expect(commit).not.toHaveBeenCalled()
  })

  it('겹치는 자리로 끌면 미리보기를 놓을 수 없음으로 표시', () => {
    const { tools } = setup(withNotes(d0, [tap(960, 'Note_1')]))
    tools.onPointerDown(left(X0, yOf(0)))
    expect(tools.overlay().previewInvalid).toBe(false)
    tools.onPointerMove(left(X0, yOf(1440)))
    expect(tools.overlay().previewInvalid).toBe(true)
    tools.onPointerMove(left(X0, yOf(480)))
    expect(tools.overlay().previewInvalid).toBe(false)
  })

  it('Escape(cancel)로 드래그 취소', () => {
    const { tools, notes } = setup()
    tools.onPointerDown(left(X0, yOf(0)))
    tools.onPointerMove(left(X0, yOf(960)))
    tools.cancel()
    expect(tools.overlay().preview).toEqual([])
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
    const { tools, notes, labels } = setup(withNotes(d0, [tap(0, 'Note_1'), tap(480, 'Note_2')]), 'select')
    tools.onContextMenu(right(X1, yOf(480) + 3))
    expect(notes()).toEqual([tap(0, 'Note_1')])
    expect(labels()).toEqual(['노트 삭제'])
  })

  it('레인 안 빈 곳은 아무 일도 없음', () => {
    const { tools, notes } = setup(withNotes(d0, [tap(0, 'Note_1')]))
    tools.onContextMenu(right(X1, yOf(0)))
    expect(notes()).toEqual([tap(0, 'Note_1')])
    expect(commit).not.toHaveBeenCalled()
  })

  it('왼쪽 드래그 중에는 무시', () => {
    const { tools, notes } = setup(withNotes(d0, [tap(480, 'Note_2')]))
    tools.onPointerDown(left(X0, yOf(0)))
    tools.onContextMenu(right(X1, yOf(480)))
    expect(notes()).toEqual([tap(480, 'Note_2')])
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

  it('녹음 중에는 마커도 지우지 않음', () => {
    const markers = [{ ms: 0, label: '' }]
    const { store, tools, labels } = setup({ ...d0, editorData: { ...d0.editorData, markers } })
    store.set({ playing: true, mode: 'recording' })
    tools.onContextMenu(right(layout.waveX + 10, 600))
    expect(store.getState().doc.editorData.markers).toEqual(markers)
    expect(labels()).toEqual([])
  })
})

describe('지우기 도구', () => {
  it('드래그로 지나간 노트를 숨기고 놓을 때 한 번에 삭제', () => {
    const start = [tap(0, 'Note_1'), tap(480, 'Note_1'), tap(240, 'Note_2')]
    const { store, tools, notes, labels } = setup(withNotes(d0, start), 'erase')
    tools.onPointerDown(left(X0, yOf(0)))
    // 한 번에 크게 움직여도 사이에 있는 노트(tick 480 = y 360)를 놓치지 않는다
    tools.onPointerMove(left(X0, yOf(600)))
    expect([...tools.overlay().hiddenKeys].sort()).toEqual(['Note_1:0', 'Note_1:480'])
    expect(notes()).toEqual(start)
    tools.onPointerUp(left(X0, yOf(600)))
    expect(notes()).toEqual([tap(240, 'Note_2')])
    expect(labels()).toEqual(['노트 지우기'])
    expect(tools.overlay().hiddenKeys.size).toBe(0)
    store.undo()
    expect(notes()).toEqual(start)
  })

  it('아무것도 지나지 않으면 기록 없음', () => {
    const { tools } = setup(withNotes(d0, [tap(0, 'Note_2')]), 'erase')
    tools.onPointerDown(left(X0, yOf(0)))
    tools.onPointerUp(left(X0, yOf(0)))
    expect(commit).not.toHaveBeenCalled()
  })
})

describe('선택 도구', () => {
  const start = [tap(0, 'Note_1'), tap(480, 'Note_2'), tap(960, 'Note_3')]
  const selection = (store: EditorStore) => [...store.getState().selection].sort()

  it('빈 곳에서 끌면 사각 선택, 빈 곳 클릭은 선택 해제', () => {
    const { store, tools, notes } = setup(withNotes(d0, start), 'select')
    tools.onPointerDown(left(X0, yOf(240)))
    tools.onPointerMove(left(X1, yOf(720)))
    const rect = tools.overlay().selectRect
    expect(rect && [rect.lane0, rect.lane1]).toEqual([0, 1])
    expect(selection(store)).toEqual(['Note_2:480'])
    tools.onPointerUp(left(X1, yOf(720)))
    expect(tools.overlay().selectRect).toBeNull()
    expect(selection(store)).toEqual(['Note_2:480'])

    tools.onPointerDown(left(X2, yOf(240)))
    tools.onPointerUp(left(X2, yOf(240)))
    expect(selection(store)).toEqual([])
    expect(notes()).toEqual(start)
    expect(commit).not.toHaveBeenCalled()
  })

  it('움직이지 않은 빈 곳 클릭은 사각형 없이 선택만 해제 (Shift면 유지)', () => {
    const { store, tools } = setup(withNotes(d0, start), 'select')
    store.set({ selection: new Set(['Note_1:0']) })
    tools.onPointerDown(left(X2, yOf(240), true))
    expect(tools.overlay().selectRect).toBeNull()
    tools.onPointerUp(left(X2, yOf(240), true))
    expect(selection(store)).toEqual(['Note_1:0'])
    tools.onPointerDown(left(X2, yOf(240)))
    expect(tools.overlay().selectRect).toBeNull()
    expect(selection(store)).toEqual([])
    tools.onPointerUp(left(X2, yOf(240)))
    expect(selection(store)).toEqual([])
  })

  it('레인 밖까지 끌어도 걸친 레인만 선택', () => {
    const { store, tools } = setup(withNotes(d0, start), 'select')
    tools.onPointerDown(left(layout.waveX, yOf(-100)))
    tools.onPointerMove(left(X1, yOf(1200)))
    expect(selection(store)).toEqual(['Note_1:0', 'Note_2:480'])
  })

  it('Shift+드래그는 기존 선택에 추가, Shift+클릭은 토글', () => {
    const { store, tools } = setup(withNotes(d0, start), 'select')
    store.set({ selection: new Set(['Note_1:0']) })
    tools.onPointerDown(left(X2, yOf(720), true))
    tools.onPointerMove(left(X2, yOf(1200), true))
    tools.onPointerUp(left(X2, yOf(1200), true))
    expect(selection(store)).toEqual(['Note_1:0', 'Note_3:960'])

    tools.onPointerDown(left(X0, yOf(0), true))
    tools.onPointerUp(left(X0, yOf(0), true))
    expect(selection(store)).toEqual(['Note_3:960'])
    tools.onPointerDown(left(X1, yOf(480), true))
    tools.onPointerUp(left(X1, yOf(480), true))
    expect(selection(store)).toEqual(['Note_2:480', 'Note_3:960'])
  })

  it('Escape(cancel)로 사각 선택을 취소하면 원래 선택으로', () => {
    const { store, tools } = setup(withNotes(d0, start), 'select')
    store.set({ selection: new Set(['Note_3:960']) })
    tools.onPointerDown(left(X0, yOf(240)))
    tools.onPointerMove(left(X1, yOf(720)))
    tools.cancel()
    expect(tools.overlay().selectRect).toBeNull()
    expect(selection(store)).toEqual(['Note_3:960'])
  })

  it('선택한 노트를 끌면 스냅 단위로 옮기고 놓을 때 한 번 기록', () => {
    const { store, tools, notes, labels } = setup(withNotes(d0, start), 'select')
    store.set({ selection: new Set(['Note_1:0', 'Note_2:480']) })
    tools.onPointerDown(left(X0, yOf(0) + 2))
    tools.onPointerMove(left(X1, yOf(500)))
    expect([...tools.overlay().hiddenKeys].sort()).toEqual(['Note_1:0', 'Note_2:480'])
    expect(tools.overlay().preview).toEqual([tap(480, 'Note_2'), tap(960, 'Note_3')])
    expect(tools.overlay().previewInvalid).toBe(true) // Note_3:960과 겹친다
    tools.onPointerMove(left(X1, yOf(1400)))
    expect(tools.overlay().preview).toEqual([tap(1440, 'Note_2'), tap(1920, 'Note_3')])
    expect(tools.overlay().previewInvalid).toBe(false)
    expect(notes()).toEqual(start)
    tools.onPointerUp(left(X1, yOf(1400)))
    expect(notes()).toEqual([tap(960, 'Note_3'), tap(1440, 'Note_2'), tap(1920, 'Note_3')])
    expect(labels()).toEqual(['노트 이동'])
    expect(selection(store)).toEqual(['Note_2:1440', 'Note_3:1920'])
    expect(tools.overlay().preview).toEqual([])
    expect(tools.overlay().hiddenKeys.size).toBe(0)
    store.undo()
    expect(notes()).toEqual(start)
  })

  it('선택 안 된 노트를 끌면 그 노트만 선택해 옮긴다', () => {
    const { store, tools, notes } = setup(withNotes(d0, start), 'select')
    store.set({ selection: new Set(['Note_2:480']) })
    tools.onPointerDown(left(X0, yOf(0)))
    expect(selection(store)).toEqual(['Note_1:0'])
    tools.onPointerMove(left(X0, yOf(480)))
    tools.onPointerUp(left(X0, yOf(480)))
    expect(notes()).toEqual([tap(480, 'Note_1'), tap(480, 'Note_2'), tap(960, 'Note_3')])
  })

  it('놓을 수 없는 자리면 원위치, 기록 없음', () => {
    const { store, tools, notes } = setup(withNotes(d0, start), 'select')
    store.set({ selection: new Set(['Note_1:0']) })
    tools.onPointerDown(left(X0, yOf(0)))
    tools.onPointerMove(left(X1, yOf(480)))
    tools.onPointerUp(left(X1, yOf(480)))
    tools.onPointerDown(left(X0, yOf(0)))
    tools.onPointerMove(left(X0, yOf(-480)))
    tools.onPointerUp(left(X0, yOf(-480)))
    expect(notes()).toEqual(start)
    expect(selection(store)).toEqual(['Note_1:0'])
    expect(commit).not.toHaveBeenCalled()
  })

  it('옮기는 중 우클릭은 무시', () => {
    const { store, tools, notes } = setup(withNotes(d0, start), 'select')
    store.set({ selection: new Set(['Note_1:0']) })
    tools.onPointerDown(left(X0, yOf(0)))
    tools.onContextMenu(right(X1, yOf(480)))
    expect(notes()).toEqual(start)
    expect(commit).not.toHaveBeenCalled()
  })
})
