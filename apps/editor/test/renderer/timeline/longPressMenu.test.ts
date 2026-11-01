import { describe, expect, it, vi } from 'vitest'
import type { ContextMenuItem } from '../../../src/renderer/src/ui/ContextMenu'
import { longPressMenuItems } from '../../../src/renderer/src/editor/timeline/longPressMenu'
import { fakeActions } from '../fakeActions'

const labels = (items: ContextMenuItem[]) => items.map((i) => i.label)

describe('longPressMenuItems', () => {
  const opts = { hasSelection: false, canPaste: true, deleteMarker: vi.fn() }
  it('노트 위는 편집 다섯 항목', () =>
    expect(labels(longPressMenuItems({ kind: 'note', key: 'k' }, fakeActions(), opts))).toEqual([
      '복사',
      '잘라내기',
      '붙여넣기',
      '좌우 반전',
      '삭제'
    ]))
  it('클립보드가 비면 붙여넣기를 끈다', () => {
    const items = longPressMenuItems({ kind: 'note', key: 'k' }, fakeActions(), { ...opts, canPaste: false })
    expect(items.find((i) => i.label === '붙여넣기')?.disabled).toBe(true)
  })
  it('선택 없는 빈 곳은 붙여넣기만', () =>
    expect(labels(longPressMenuItems({ kind: 'empty' }, fakeActions(), opts))).toEqual(['붙여넣기']))
  it('선택이 있으면 빈 곳도 다섯 항목', () =>
    expect(labels(longPressMenuItems({ kind: 'empty' }, fakeActions(), { ...opts, hasSelection: true }))).toHaveLength(5))
  it('마커 위는 마커 삭제', () => {
    const deleteMarker = vi.fn()
    const [item] = longPressMenuItems({ kind: 'marker', index: 2 }, fakeActions(), { ...opts, deleteMarker })
    expect(item.label).toBe('마커 삭제')
    expect(item.danger).toBe(true)
    item.onSelect()
    expect(deleteMarker).toHaveBeenCalledWith(2)
  })
  it('항목은 같은 편집 명령을 부른다', () => {
    const actions = fakeActions()
    longPressMenuItems({ kind: 'note', key: 'k' }, actions, opts).find((i) => i.label === '삭제')!.onSelect()
    expect(actions.edit).toHaveBeenCalledWith('delete')
  })
  it('트랙 밖 빈 곳은 메뉴가 없다', () => expect(longPressMenuItems({ kind: 'none' }, fakeActions(), opts)).toEqual([]))
})
