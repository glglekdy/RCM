import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TimingMap, type FreeNote } from '@rcm/core'
import { addFreeChart } from '../../../src/renderer/src/editor/commands/charts'
import { getFreeChart, replaceChart, type ProjectDoc } from '../../../src/renderer/src/editor/state/doc'
import { History } from '../../../src/renderer/src/editor/state/history'
import { EditorStore, type EditorState } from '../../../src/renderer/src/editor/state/store'
import { clickSpan, createFreeToolController, dragDirection, dragSpan } from '../../../src/renderer/src/editor/timeline/freeTools'
import { layoutFreeTimeline } from '../../../src/renderer/src/editor/timeline/view'
import { d0 } from '../fixtures'

const added = addFreeChart(d0, 'MOBILE', 12, 'directional')!
const F = added.file
const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0)
const view = { playheadMs: 0, pxPerMs: 0.48, height: 800 } // 1 tick = 0.5px, tick 0 → y 600
const layout = layoutFreeTimeline(1000, 12) // 칸 c: 284 + 36c ~ 320 + 36c
/** 칸 c의 가운데 x */
const cx = (c: number) => 284 + 36 * c + 18
/** 칸 경계 x */
const bx = (c: number) => 284 + 36 * c
const yOf = (tick: number) => 600 - tick / 2
const left = (x: number, y: number, shift = false) => ({ x, y, button: 0, shift })
const right = (x: number, y: number) => ({ x, y, button: 2, shift: false })
const tap = (tick: number, x: number, width = 3): FreeNote => ({ tick, type: 'tap', x, width })

const commit = vi.spyOn(History.prototype, 'commit')

beforeEach(() => {
  ;(globalThis as unknown as { window: unknown }).window = { rcm: { setDirty: vi.fn() } }
  commit.mockClear()
})

function withFree(notes: FreeNote[]): ProjectDoc {
  return replaceChart(added.doc, F, { ...getFreeChart(added.doc, F), notes })
}

function setup(doc: ProjectDoc = added.doc, tool: EditorState['tool'] = 'draw') {
  const store = new EditorStore({ dir: 'C:/p' }, doc)
  store.set({ tool, snap: 4, activeChart: F })
  const tools = createFreeToolController(store, () => ({ tm, view, layout }))
  const notes = () => getFreeChart(store.getState().doc, F).notes
  const labels = () => commit.mock.calls.map(([entry]) => entry.label)
  return { store, tools, notes, labels }
}

describe('폭 계산', () => {
  it('clickSpan은 누른 칸을 가운데로 하고 칸 안으로 민다', () => {
    expect(clickSpan(5, 3, 12)).toEqual({ x: 4, width: 3 })
    expect(clickSpan(0, 3, 12)).toEqual({ x: 0, width: 3 })
    expect(clickSpan(11, 4, 12)).toEqual({ x: 8, width: 4 })
    expect(clickSpan(3, 20, 12)).toEqual({ x: 0, width: 12 })
  })
  it('dragDirection은 끈 방향에 가장 가까운 5방향, 아래나 덜 끈 것은 null', () => {
    expect(dragDirection(0, -20)).toBe('up')
    expect(dragDirection(15, -15)).toBe('upRight')
    expect(dragDirection(-20, 0)).toBe('left')
    expect(dragDirection(20, 8)).toBe('right')
    expect(dragDirection(2, 20)).toBeNull()
    expect(dragDirection(5, -5)).toBeNull()
  })
  it('dragSpan은 양 끝 칸 포함', () => {
    expect(dragSpan(6, 2)).toEqual({ x: 2, width: 5 })
  })
})

describe('자유형 그리기 도구', () => {
  it('클릭하면 기억한 폭의 탭', () => {
    const { tools, notes, labels } = setup()
    tools.onPointerDown(left(cx(5), yOf(480)))
    expect(tools.overlay().preview).toEqual([tap(480, 4)])
    tools.onPointerUp(left(cx(5), yOf(480)))
    expect(notes()).toEqual([tap(480, 4)])
    expect(labels()).toEqual(['노트 추가'])
  })

  it('가로로 끌면 걸친 칸만큼, 그 폭을 기억한다', () => {
    const { store, tools, notes } = setup()
    store.set({ freeType: 'trace' })
    tools.onPointerDown(left(cx(2), yOf(0)))
    tools.onPointerMove(left(cx(7), yOf(0)))
    tools.onPointerUp(left(cx(7), yOf(0)))
    expect(notes()).toEqual([{ tick: 0, type: 'trace', x: 2, width: 6 }])
    expect(store.getState().freeWidth).toBe(6)
  })

  it('플릭은 고른 방향으로', () => {
    const { store, tools, notes } = setup()
    store.set({ freeType: 'flick', flickDirection: 'upRight' })
    tools.onPointerDown(left(cx(1), yOf(0)))
    tools.onPointerUp(left(cx(1), yOf(0)))
    expect(notes()).toEqual([{ tick: 0, type: 'flick', x: 0, width: 3, direction: 'upRight' }])
  })

  it('플릭: 누른 채 끈 방향으로 만들고 그 방향을 기억한다', () => {
    const { store, tools, notes } = setup()
    store.set({ freeType: 'flick', flickDirection: 'up' })
    tools.onPointerDown(left(cx(5), yOf(0)))
    tools.onPointerMove(left(cx(5) - 30, yOf(0) - 2))
    expect(tools.overlay().preview).toEqual([{ tick: 0, type: 'flick', x: 4, width: 3, direction: 'left' }])
    tools.onPointerMove(left(cx(5) + 20, yOf(0) - 22))
    tools.onPointerUp(left(cx(5) + 20, yOf(0) - 22))
    expect(notes()).toEqual([{ tick: 0, type: 'flick', x: 4, width: 3, direction: 'upRight' }])
    expect(store.getState().flickDirection).toBe('upRight')
  })

  it('플릭: 방향 무관 채보는 옆으로 끌면 폭', () => {
    const doc = replaceChart(added.doc, F, { ...getFreeChart(added.doc, F), flickMode: 'any' })
    const { store, tools, notes } = setup(doc)
    store.set({ freeType: 'flick' })
    tools.onPointerDown(left(cx(2), yOf(0)))
    tools.onPointerMove(left(cx(5), yOf(0)))
    tools.onPointerUp(left(cx(5), yOf(0)))
    expect(notes()).toEqual([{ tick: 0, type: 'flick', x: 2, width: 4 }])
  })

  it('슬라이드: 위로 끌어 끝 지점을 정한다', () => {
    const { store, tools, notes, labels } = setup()
    store.set({ freeType: 'slide' })
    tools.onPointerDown(left(cx(1), yOf(0)))
    tools.onPointerMove(left(cx(8), yOf(960)))
    tools.onPointerUp(left(cx(8), yOf(960)))
    expect(notes()).toEqual([
      { type: 'slide', points: [{ tick: 0, x: 0, width: 3 }, { tick: 960, x: 7, width: 3 }] }
    ])
    expect(labels()).toEqual(['슬라이드 추가'])
  })

  it('슬라이드: 먼저 옆으로 끌면 폭을 정하고 그 폭을 기억한다', () => {
    const { store, tools, notes } = setup()
    store.set({ freeType: 'slide' })
    tools.onPointerDown(left(cx(2), yOf(0)))
    tools.onPointerMove(left(cx(6), yOf(0)))
    tools.onPointerMove(left(cx(8), yOf(960)))
    tools.onPointerUp(left(cx(8), yOf(960)))
    expect(notes()).toEqual([
      { type: 'slide', points: [{ tick: 0, x: 2, width: 5 }, { tick: 960, x: 6, width: 5 }] }
    ])
    expect(store.getState().freeWidth).toBe(5)
  })

  it('슬라이드: 위로 끌지 않고 놓으면 아무것도 만들지 않는다', () => {
    const { store, tools, notes } = setup()
    store.set({ freeType: 'slide' })
    tools.onPointerDown(left(cx(2), yOf(0)))
    tools.onPointerMove(left(cx(6), yOf(0)))
    tools.onPointerUp(left(cx(6), yOf(0)))
    expect(notes()).toEqual([])
  })

  it('슬라이드 몸통을 누르면 지점이 생기고 끌어 옮긴다 (기록 하나)', () => {
    const doc = withFree([{ type: 'slide', points: [{ tick: 0, x: 0, width: 3 }, { tick: 960, x: 0, width: 3 }] }])
    const { store, tools, notes, labels } = setup(doc)
    store.set({ freeType: 'slide' })
    tools.onPointerDown(left(cx(1), yOf(480)))
    tools.onPointerMove(left(cx(5), yOf(480)))
    tools.onPointerUp(left(cx(5), yOf(480)))
    expect(notes()).toEqual([
      {
        type: 'slide',
        points: [
          { tick: 0, x: 0, width: 3 },
          { tick: 480, x: 4, width: 3 },
          { tick: 960, x: 0, width: 3 }
        ]
      }
    ])
    expect(labels()).toEqual(['슬라이드 지점 추가'])
  })

  it('노트를 끌면 옮기고, 끝을 끌면 폭이 바뀐다', () => {
    const { tools, notes, labels } = setup(withFree([tap(0, 0)]))
    tools.onPointerDown(left(cx(1), yOf(0)))
    tools.onPointerMove(left(cx(3), yOf(480)))
    tools.onPointerUp(left(cx(3), yOf(480)))
    expect(notes()).toEqual([tap(480, 2)])
    // 오른쪽 끝(칸 5 경계 바로 안)을 칸 8 경계로
    tools.onPointerDown(left(bx(5) - 2, yOf(480)))
    tools.onPointerMove(left(bx(8), yOf(480)))
    tools.onPointerUp(left(bx(8), yOf(480)))
    expect(notes()).toEqual([tap(480, 2, 6)])
    expect(labels()).toEqual(['노트 이동', '노트 폭 조절'])
  })

  it('우클릭: 노트 삭제, 슬라이드 중간 지점은 지점만 삭제', () => {
    const doc = withFree([
      tap(0, 6),
      {
        type: 'slide',
        points: [
          { tick: 480, x: 0, width: 3 },
          { tick: 960, x: 0, width: 3 },
          { tick: 1440, x: 0, width: 3 }
        ]
      }
    ])
    const { tools, notes, labels } = setup(doc)
    tools.onContextMenu(right(cx(1), yOf(960)))
    expect(notes()[1]).toEqual({
      type: 'slide',
      points: [
        { tick: 480, x: 0, width: 3 },
        { tick: 1440, x: 0, width: 3 }
      ]
    })
    tools.onContextMenu(right(cx(7), yOf(0)))
    expect(notes()).toHaveLength(1)
    expect(labels()).toEqual(['슬라이드 지점 삭제', '노트 삭제'])
  })

  it('겹치는 자리에는 그리지 않는다', () => {
    const { tools, notes } = setup(withFree([tap(0, 0)]))
    // 칸 3을 가운데로 한 폭 3 = 칸 2~4, 기존 노트(칸 0~2)와 겹친다
    tools.onPointerDown(left(cx(3), yOf(0)))
    expect(tools.overlay().previewInvalid).toBe(true)
    tools.onPointerUp(left(cx(3), yOf(0)))
    expect(notes()).toEqual([tap(0, 0)])
  })
})

describe('자유형 연속 그리기', () => {
  it('끌고 지나간 스냅 tick마다 포인터 위치의 노트를 깐다 (기록 하나)', () => {
    const { store, tools, notes, labels } = setup(added.doc, 'brush')
    store.set({ freeType: 'trace', freeWidth: 2 })
    tools.onPointerDown(left(cx(0), yOf(0)))
    tools.onPointerMove(left(cx(6), yOf(1440)))
    expect(tools.overlay().preview).toHaveLength(4)
    tools.onPointerUp(left(cx(6), yOf(1440)))
    expect(notes()).toEqual([
      { tick: 0, type: 'trace', x: 0, width: 2 },
      { tick: 480, type: 'trace', x: 2, width: 2 },
      { tick: 960, type: 'trace', x: 4, width: 2 },
      { tick: 1440, type: 'trace', x: 6, width: 2 }
    ])
    expect(labels()).toEqual(['노트 연속 추가'])
  })

  it('이미 노트가 있는 자리는 건너뛴다', () => {
    const { tools, notes } = setup(withFree([tap(480, 0)]), 'brush')
    tools.onPointerDown(left(cx(1), yOf(0)))
    tools.onPointerMove(left(cx(1), yOf(960)))
    tools.onPointerUp(left(cx(1), yOf(960)))
    expect(notes()).toEqual([tap(0, 0), tap(480, 0), tap(960, 0)])
  })

  it('슬라이드는 끈 경로로 하나, 직선 위 지점은 줄이고 꺾이는 곳은 숨은 지점', () => {
    const { store, tools, notes, labels } = setup(added.doc, 'brush')
    store.set({ freeType: 'slide', freeWidth: 3 })
    tools.onPointerDown(left(cx(1), yOf(0)))
    tools.onPointerMove(left(cx(5), yOf(1920)))
    tools.onPointerMove(left(cx(5), yOf(2880)))
    tools.onPointerUp(left(cx(5), yOf(2880)))
    expect(notes()).toEqual([
      {
        type: 'slide',
        points: [
          { tick: 0, x: 0, width: 3 },
          { tick: 1920, x: 4, width: 3, hidden: true },
          { tick: 2880, x: 4, width: 3 }
        ]
      }
    ])
    expect(labels()).toEqual(['슬라이드 추가'])
  })
})

describe('자유형 선택·지우기 도구', () => {
  it('사각 선택은 가로로 걸친 노트를 고른다', () => {
    const { store, tools } = setup(withFree([tap(0, 0), tap(0, 6), tap(960, 0)]), 'select')
    tools.onPointerDown(left(bx(2), yOf(0) + 8))
    tools.onPointerMove(left(bx(5), yOf(480)))
    tools.onPointerUp(left(bx(5), yOf(480)))
    expect([...store.getState().selection]).toEqual(['0@0'])
  })

  it('선택한 노트를 함께 옮긴다', () => {
    const { store, tools, notes } = setup(withFree([tap(0, 0), tap(0, 6)]), 'select')
    store.set({ selection: new Set(['0@0', '0@6']) })
    tools.onPointerDown(left(cx(1), yOf(0)))
    tools.onPointerMove(left(cx(1), yOf(480)))
    tools.onPointerUp(left(cx(1), yOf(480)))
    expect(notes()).toEqual([tap(480, 0), tap(480, 6)])
    expect([...store.getState().selection].sort()).toEqual(['480@0', '480@6'])
  })

  it('지우기 도구로 끌어 지운다', () => {
    const { tools, notes } = setup(withFree([tap(0, 0), tap(480, 0)]), 'erase')
    tools.onPointerDown(left(cx(1), yOf(0)))
    tools.onPointerMove(left(cx(1), yOf(480)))
    tools.onPointerUp(left(cx(1), yOf(480)))
    expect(notes()).toEqual([])
  })
})
