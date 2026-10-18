import { describe, expect, it } from 'vitest'
import { freeNoteKey, type FreeNote } from '@rcm/core'
import { d0 } from '../fixtures'
import { getFreeChart, replaceChart, type ProjectDoc } from '../../../src/renderer/src/editor/state/doc'
import { addFreeChart } from '../../../src/renderer/src/editor/commands/charts'
import {
  addFreeNote,
  changeFreeType,
  copyFreeNotes,
  insertSlidePoint,
  mirrorFreeNotes,
  moveFreeNotes,
  pasteFreeClip,
  removeFreeNotes,
  removeSlidePoint,
  replaceFreeNote,
  setFlickDirection,
  setFreeNoteWidth,
  setSlideEndFlick,
  updateFreeSettings,
  updateSlidePoint,
  withSpan
} from '../../../src/renderer/src/editor/commands/freeNotes'

const added = addFreeChart(d0, 'MOBILE', 12, 'directional')!
const F = added.file
const base = added.doc

const tap = (tick: number, x: number, width = 3): FreeNote => ({ tick, type: 'tap', x, width })
const slide = (...pts: [number, number][]): FreeNote => ({
  type: 'slide',
  points: pts.map(([tick, x]) => ({ tick, x, width: 3 }))
})
const withFree = (notes: FreeNote[], doc: ProjectDoc = base): ProjectDoc =>
  replaceChart(doc, F, { ...getFreeChart(doc, F), notes })
const keys = (doc: ProjectDoc) => getFreeChart(doc, F).notes.map(freeNoteKey)
const slidePoints = (doc: ProjectDoc, i = 0) =>
  (getFreeChart(doc, F).notes[i] as Extract<FreeNote, { type: 'slide' }>).points

describe('addFreeChart', () => {
  it('자유형 채보를 만든다', () => {
    expect(F).toBe('mobile.chart.json')
    expect(getFreeChart(base, F)).toMatchObject({ layout: 'free', columns: 12, flickMode: 'directional', notes: [] })
    expect(addFreeChart(d0, ' ', 12, 'any')).toBeNull()
    expect(addFreeChart(d0, 'X', 0, 'any')).toBeNull()
    expect(addFreeChart(d0, 'X', 33, 'any')).toBeNull()
  })
})

describe('자유형 노트 편집', () => {
  it('추가: 칸 밖·겹침·방향 규칙을 거부하고 정렬을 유지한다', () => {
    const d = addFreeNote(base, F, tap(480, 6))!
    expect(addFreeNote(d, F, tap(480, 7))).toBeNull()
    expect(addFreeNote(d, F, tap(0, 10))).toBeNull()
    expect(addFreeNote(d, F, { tick: 0, type: 'flick', x: 0, width: 2 })).toBeNull()
    const d2 = addFreeNote(d, F, tap(0, 0))!
    expect(keys(d2)).toEqual(['0@0', '480@6'])
  })

  it('삭제', () => {
    const d = withFree([tap(0, 0), tap(480, 3)])
    expect(keys(removeFreeNotes(d, F, new Set(['0@0']))!)).toEqual(['480@3'])
    expect(removeFreeNotes(d, F, new Set(['1@1']))).toBeNull()
  })

  it('이동: 슬라이드는 모든 지점이 함께 움직이고 칸 밖이면 거부한다', () => {
    const d = withFree([slide([0, 0], [480, 4])])
    const moved = moveFreeNotes(d, F, new Set(['0@0']), 240, 2)!
    expect(getFreeChart(moved.doc, F).notes[0]).toEqual(slide([240, 2], [720, 6]))
    expect([...moved.keys]).toEqual(['240@2'])
    expect(moveFreeNotes(d, F, new Set(['0@0']), 0, 6)).toBeNull()
  })

  it('이동: 옮긴 노트끼리 겹쳐도 거부한다', () => {
    const d = withFree([tap(0, 0), tap(480, 0)])
    expect(moveFreeNotes(d, F, new Set(['0@0', '480@0']), 480, 0)).not.toBeNull()
  })

  it('반전: 위치와 플릭 방향을 뒤집는다', () => {
    const d = withFree([{ tick: 0, type: 'flick', x: 0, width: 3, direction: 'upLeft' }])
    const r = mirrorFreeNotes(d, F, new Set(['0@0']))!
    expect(getFreeChart(r.doc, F).notes[0]).toEqual({ tick: 0, type: 'flick', x: 9, width: 3, direction: 'upRight' })
  })

  it('폭 조절', () => {
    const d = withFree([tap(0, 0)])
    const r = replaceFreeNote(d, F, '0@0', withSpan(tap(0, 0), 1, 5))!
    expect(getFreeChart(r.doc, F).notes[0]).toEqual(tap(0, 1, 5))
    expect(replaceFreeNote(d, F, '0@0', withSpan(tap(0, 0), 8, 5))).toBeNull()
  })

  it('종류 바꾸기와 플릭 방향', () => {
    const d = withFree([tap(0, 0), slide([0, 4], [480, 4])])
    const r = changeFreeType(d, F, new Set(['0@0', '0@4']), 'flick', 'left')!
    const notes = getFreeChart(r.doc, F).notes
    expect(notes[0]).toEqual({ tick: 0, type: 'flick', x: 0, width: 3, direction: 'left' })
    expect(notes[1].type).toBe('slide')
    const r2 = setFlickDirection(r.doc, F, new Set(['0@0']), 'up')!
    expect(getFreeChart(r2.doc, F).notes[0]).toMatchObject({ direction: 'up' })
  })

  it('슬라이드 끝 플릭', () => {
    const d = withFree([slide([0, 0], [480, 4])])
    const on = setSlideEndFlick(d, F, '0@0', true, 'right')!
    expect(getFreeChart(on.doc, F).notes[0]).toMatchObject({ endFlick: true, direction: 'right' })
    const off = setSlideEndFlick(on.doc, F, '0@0', false, 'right')!
    expect(getFreeChart(off.doc, F).notes[0]).toEqual(slide([0, 0], [480, 4]))
  })

  it('슬라이드 지점 넣기·바꾸기·지우기', () => {
    const d = withFree([slide([0, 0], [960, 8])])
    const ins = insertSlidePoint(d, F, '0@0', 480, (t) => t)!
    expect(ins.index).toBe(1)
    let cur = ins.doc
    expect(slidePoints(cur)[1]).toEqual({ tick: 480, x: 4, width: 3 })
    expect(insertSlidePoint(d, F, '0@0', 0, (t) => t)).toBeNull()
    expect(insertSlidePoint(d, F, '0@0', 960, (t) => t)).toBeNull()

    cur = updateSlidePoint(cur, F, '0@0', 1, { hidden: true })!.doc
    expect(slidePoints(cur)[1].hidden).toBe(true)
    cur = updateSlidePoint(cur, F, '0@0', 0, { ease: 'easeOut' })!.doc
    expect(slidePoints(cur)[0].ease).toBe('easeOut')
    expect(updateSlidePoint(cur, F, '0@0', 0, { hidden: true })).toBeNull()

    cur = removeSlidePoint(cur, F, '0@0', 1)!.doc
    expect(slidePoints(cur).length).toBe(2)
    expect(removeSlidePoint(cur, F, '0@0', 1)).toBeNull()
  })

  it('폭 바꾸기: 슬라이드는 모든 지점, 칸을 넘으면 안쪽으로 민다', () => {
    const d = withFree([tap(0, 8), slide([480, 0], [960, 8])])
    const r = setFreeNoteWidth(d, F, new Set(['0@8', '480@0']), 5)!
    expect(getFreeChart(r.doc, F).notes[0]).toEqual(tap(0, 7, 5))
    expect(slidePoints(r.doc, 1).map((p) => [p.x, p.width])).toEqual([[0, 5], [7, 5]])
    expect([...r.keys].sort()).toEqual(['0@7', '480@0'])
    expect(setFreeNoteWidth(d, F, new Set(['0@8']), 0)).toBeNull()
    const one = updateSlidePoint(d, F, '480@0', 1, { width: 1.5 })!
    expect(slidePoints(one.doc, 1)[1]).toEqual({ tick: 960, x: 8, width: 1.5 })
  })

  it('칸 수·플릭 방식 바꾸기', () => {
    const d = withFree([{ tick: 0, type: 'flick', x: 6, width: 3, direction: 'left' }])
    expect(updateFreeSettings(d, F, { columns: 8 })).toBeNull()
    expect(getFreeChart(updateFreeSettings(d, F, { columns: 9 })!, F).columns).toBe(9)
    const any = updateFreeSettings(d, F, { flickMode: 'any' })!
    expect(getFreeChart(any, F).notes[0]).toEqual({ tick: 0, type: 'flick', x: 6, width: 3 })
    const back = updateFreeSettings(any, F, { flickMode: 'directional' })!
    expect(getFreeChart(back, F).notes[0]).toMatchObject({ direction: 'up' })
    expect(updateFreeSettings(d, F, {})).toBeNull()
  })

  it('복사·붙여넣기', () => {
    const d = withFree([tap(480, 0), slide([960, 4], [1440, 4])])
    const clip = copyFreeNotes(getFreeChart(d, F), new Set(['480@0', '960@4']))!
    expect(clip.notes[0]).toEqual(tap(0, 0))
    const pasted = pasteFreeClip(d, F, clip, 1920)!
    expect([...pasted.keys]).toEqual(['1920@0', '2400@4'])
    expect(pasteFreeClip(d, F, clip, 480)).toBeNull()
  })
})
