import { useEffect, useRef } from 'react'
import type { EditorState } from '../state/store'
import { useEditor, useStore } from '../state/useStore'

type FocusKind = NonNullable<EditorState['focusPoint']>['kind']

const FLASH_MS = 1500

/**
 * 타임라인 칩으로 고른 지점(focusPoint)이 kind면, 돌려준 ref 안의 `data-tick`이 같은 행으로 스크롤하고 잠시 강조한다.
 * 강조한 뒤 focusPoint를 비워 탭을 다시 열 때 또 강조하지 않게 한다.
 */
export function useFocusPoint<T extends HTMLElement>(kind: FocusKind) {
  const store = useStore()
  const ref = useRef<T>(null)
  const focus = useEditor((s) => s.focusPoint)

  useEffect(() => {
    if (!focus || focus.kind !== kind) return
    store.set({ focusPoint: null })
    const row = ref.current?.querySelector<HTMLElement>(`[data-tick="${focus.tick}"]`)
    if (!row) return
    row.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const color = getComputedStyle(row).getPropertyValue('--accent-soft').trim()
    row.animate(
      [
        { backgroundColor: color, boxShadow: `0 0 0 4px ${color}` },
        { backgroundColor: 'transparent', boxShadow: '0 0 0 4px transparent' }
      ],
      { duration: FLASH_MS, easing: 'ease-in' }
    )
  }, [focus, kind, store])

  return ref
}
