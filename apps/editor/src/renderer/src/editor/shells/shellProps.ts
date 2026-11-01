import type { ReactNode } from 'react'
import type { EditorActions } from '../editorActions'

/** 편집 화면의 틀(Shell)이 받는 값. 틀은 배치만 정하고 동작은 모두 이 값으로 받는다 */
export interface ShellProps {
  title: string
  dirty: boolean
  actions: EditorActions
  /** `<TimelineCanvas />` 요소 */
  timeline: ReactNode
  /** `<Minimap />` 요소 */
  minimap: ReactNode
  /** 테스트 플레이 화면에 덮여 있는 동안 편집 화면이 포커스·클릭을 받지 않게 한다 */
  inert: boolean
}
