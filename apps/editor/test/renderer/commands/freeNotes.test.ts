import { describe, expect, it } from 'vitest'
import { freeNoteKey, type FreeNote } from '@rcm/core'
import { d0 } from '../fixtures'
import { getFreeChart, replaceChart, type ProjectDoc } from '../../../src/renderer/src/editor/state/doc'
import { addFreeChart } from '../../../src/renderer/src/editor/commands/charts'
import {
  addFreeNote,
  addGimmick,
  changeFreeType,
  changeToGimmick,
  gimmickError,
  gimmickNoteCount,
  nextGimmickColor,
  removeGimmick,
  updateGimmick,
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

describe('기믹 노트 종류', () => {
  const bomb = (tick: number, x: number, gimmick = '폭탄'): FreeNote => ({ tick, type: 'gimmick', gimmick, x, width: 3 })
  const withBomb = addGimmick(base, F, { name: ' 폭탄 ', color: '#EF4444' })!

  it('처음에는 없고, 추가하면 이름 앞뒤 공백을 지우고 색은 소문자로', () => {
    expect(getFreeChart(base, F).gimmicks).toBeUndefined()
    expect(getFreeChart(withBomb, F).gimmicks).toEqual([{ name: '폭탄', color: '#ef4444' }])
  })

  it('빈 이름·같은 이름·잘못된 색은 거부한다', () => {
    const chart = getFreeChart(withBomb, F)
    expect(addGimmick(withBomb, F, { name: '  ', color: '#ef4444' })).toBeNull()
    expect(addGimmick(withBomb, F, { name: '폭탄', color: '#00ff00' })).toBeNull()
    expect(addGimmick(withBomb, F, { name: '빛', color: 'red' })).toBeNull()
    expect(gimmickError(chart, { name: '폭탄', color: '#00ff00' })).toBe('같은 이름의 기믹 노트가 있어요')
    // 고치는 중인 자기 이름은 괜찮다
    expect(gimmickError(chart, { name: '폭탄', color: '#00ff00' }, '폭탄')).toBeNull()
  })

  it('새 색은 아직 안 쓴 색부터', () => {
    expect(nextGimmickColor(getFreeChart(base, F))).toBe('#ef4444')
    expect(nextGimmickColor(getFreeChart(withBomb, F))).toBe('#a78bfa')
  })

  it('기믹 노트는 종류가 있어야 놓이고, 다른 노트처럼 겹침 검사를 받는다', () => {
    expect(addFreeNote(base, F, bomb(0, 0))).toBeNull()
    const doc = addFreeNote(withBomb, F, bomb(0, 0))!
    expect(getFreeChart(doc, F).notes).toEqual([bomb(0, 0)])
    expect(addFreeNote(doc, F, tap(0, 1))).toBeNull()
  })

  it('이름을 바꾸면 그 종류의 노트도 따라가고, 색만 바꿀 수도 있다', () => {
    const doc = withFree([bomb(0, 0), tap(480, 0)], withBomb)
    const renamed = updateGimmick(doc, F, '폭탄', { name: '지뢰', color: '#ef4444' })!
    expect(getFreeChart(renamed, F).gimmicks).toEqual([{ name: '지뢰', color: '#ef4444' }])
    expect(getFreeChart(renamed, F).notes).toEqual([bomb(0, 0, '지뢰'), tap(480, 0)])
    const recolored = updateGimmick(doc, F, '폭탄', { name: '폭탄', color: '#22d3ee' })!
    expect(getFreeChart(recolored, F).gimmicks).toEqual([{ name: '폭탄', color: '#22d3ee' }])
    expect(updateGimmick(doc, F, '폭탄', { name: '폭탄', color: '#ef4444' })).toBeNull()
  })

  it('지우면 그 종류의 노트도 지우고, 마지막 종류면 gimmicks를 뺀다', () => {
    const doc = withFree([bomb(0, 0), tap(480, 0), bomb(960, 4)], withBomb)
    expect(gimmickNoteCount(getFreeChart(doc, F), '폭탄')).toBe(2)
    const removed = removeGimmick(doc, F, '폭탄')!
    expect(getFreeChart(removed, F).notes).toEqual([tap(480, 0)])
    expect('gimmicks' in getFreeChart(removed, F)).toBe(false)
    expect(removeGimmick(doc, F, '없음')).toBeNull()
  })

  it('단발 노트를 기믹으로, 기믹을 탭으로 바꾼다 (슬라이드는 그대로)', () => {
    const doc = withFree([tap(0, 0), slide([480, 0], [960, 0])], withBomb)
    const r = changeToGimmick(doc, F, new Set(keys(doc)), '폭탄')!
    expect(getFreeChart(r.doc, F).notes).toEqual([bomb(0, 0), slide([480, 0], [960, 0])])
    const back = changeFreeType(r.doc, F, new Set(['0@0']), 'tap', 'up')!
    expect(getFreeChart(back.doc, F).notes[0]).toEqual(tap(0, 0))
    expect(changeToGimmick(doc, F, new Set(['0@0']), '없음')).toBeNull()
  })
})

describe('기믹 슬라이드 명령', () => {
  const withLaser = addGimmick(base, F, { name: '레이저', color: '#22d3ee' })!
  const laser = (gimmick = '레이저'): FreeNote => ({
    type: 'slide',
    gimmick,
    points: [
      { tick: 0, x: 0, width: 3 },
      { tick: 960, x: 6, width: 2 }
    ]
  })

  it('기믹 슬라이드도 종류 이름 변경·삭제·개수 세기에 들어간다', () => {
    const doc = withFree([laser(), tap(480, 6)], withLaser)
    expect(gimmickNoteCount(getFreeChart(doc, F), '레이저')).toBe(1)
    const renamed = updateGimmick(doc, F, '레이저', { name: '빔', color: '#22d3ee' })!
    expect(getFreeChart(renamed, F).notes[0]).toEqual(laser('빔'))
    expect(getFreeChart(removeGimmick(doc, F, '레이저')!, F).notes).toEqual([tap(480, 6)])
  })

  it('종류를 바꿔도 경로는 그대로, 치는 슬라이드는 바꾸지 않고, 끝 플릭은 켤 수 없다', () => {
    const doc = addGimmick(withFree([laser(), slide([480, 0], [960, 0])], withLaser), F, { name: '빛', color: '#a3e635' })!
    const r = changeToGimmick(doc, F, new Set(keys(doc)), '빛')!
    expect(getFreeChart(r.doc, F).notes).toEqual([laser('빛'), slide([480, 0], [960, 0])])
    expect(setSlideEndFlick(doc, F, '0@0', true, 'up')).toBeNull()
  })
})
