import { describe, expect, it, vi } from 'vitest'
import { moreMenuItems } from '../../src/renderer/src/editor/shells/moreMenu'
import { fakeActions } from './fakeActions'

describe('moreMenuItems', () => {
  it('세로 ⋯ 메뉴는 파일 메뉴 다음에 편집과 확대가 온다', () =>
    expect(
      moreMenuItems(fakeActions(), { canChooseFolder: false, includeUndo: false, zoomIn: vi.fn(), zoomOut: vi.fn() }).map(
        (i) => i.label
      )
    ).toEqual([
      '새 프로젝트',
      '저장',
      '채보 불러오기',
      '채보 내보내기',
      '프로젝트 ZIP으로 내보내기',
      '홈으로',
      '복사',
      '잘라내기',
      '붙여넣기',
      '좌우 반전',
      '삭제',
      '확대',
      '축소'
    ]))

  it('가로 ⋯ 메뉴는 되돌리기·다시 하기로 시작한다', () =>
    expect(
      moreMenuItems(fakeActions(), { canChooseFolder: false, includeUndo: true, zoomIn: vi.fn(), zoomOut: vi.fn() })
        .slice(0, 2)
        .map((i) => i.label)
    ).toEqual(['되돌리기', '다시 하기']))

  it('좌우 반전은 mirror 편집을 부른다', () => {
    const a = fakeActions()
    moreMenuItems(a, { canChooseFolder: false, includeUndo: false, zoomIn: vi.fn(), zoomOut: vi.fn() })
      .find((i) => i.label === '좌우 반전')!
      .onSelect()
    expect(a.edit).toHaveBeenCalledWith('mirror')
  })

  it('폴더를 고를 수 있으면 열기가 들어간다', () =>
    expect(
      moreMenuItems(fakeActions(), { canChooseFolder: true, includeUndo: false, zoomIn: vi.fn(), zoomOut: vi.fn() }).map(
        (i) => i.label
      )
    ).toContain('열기'))
})
