import { describe, expect, it } from 'vitest'
import { fileMenuItems } from '../../src/renderer/src/editor/editorActions'
import { clampZoom } from '../../src/renderer/src/editor/timeline/view'
import { zoomIn, zoomOut, ZOOM_STEP } from '../../src/renderer/src/editor/toolbar/zoom'
import { fakeActions } from './fakeActions'

describe('파일 메뉴 항목', () => {
  it('PC 파일 메뉴는 열기를 포함한 7개', () =>
    expect(fileMenuItems(fakeActions(), true).map((i) => i.label)).toEqual([
      '새 프로젝트',
      '열기',
      '저장',
      '채보 불러오기',
      '채보 내보내기',
      '프로젝트 ZIP으로 내보내기',
      '홈으로'
    ]))
  it('폴더를 고를 수 없으면 열기가 없다', () =>
    expect(fileMenuItems(fakeActions(), false).map((i) => i.label)).not.toContain('열기'))
  it('항목을 고르면 해당 동작을 부른다', () => {
    const a = fakeActions()
    fileMenuItems(a, true).find((i) => i.label === '저장')!.onSelect()
    expect(a.save).toHaveBeenCalledOnce()
  })
})

describe('확대·축소', () => {
  it('한 번에 1.25배씩 바뀐다', () => {
    expect(ZOOM_STEP).toBe(1.25)
    expect(zoomIn(0.1)).toBeCloseTo(0.125)
    expect(zoomOut(0.1)).toBeCloseTo(0.08)
  })
  it('범위를 넘으면 자른다', () => {
    expect(zoomIn(1e9)).toBe(clampZoom(1e9))
    expect(zoomOut(1e-9)).toBe(clampZoom(1e-9))
  })
})

describe('탭 동작', () => {
  it('tap을 부르면 기록한다', () => {
    const a = fakeActions()
    a.tap()
    expect(a.tap).toHaveBeenCalledOnce()
  })
})
