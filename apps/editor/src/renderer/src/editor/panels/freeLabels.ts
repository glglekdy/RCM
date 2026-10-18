import type { FlickDirection, FlickMode, SlideEase } from '@rcm/core'
import type { FreeNoteType } from '../commands/freeNotes'

/** 플릭 방향 버튼: 왼쪽부터 시계 방향 */
export const FLICK_DIRECTION_OPTIONS: { value: FlickDirection; label: string }[] = [
  { value: 'left', label: '←' },
  { value: 'upLeft', label: '↖' },
  { value: 'up', label: '↑' },
  { value: 'upRight', label: '↗' },
  { value: 'right', label: '→' }
]

export const FREE_TYPE_OPTIONS: { value: FreeNoteType; label: string }[] = [
  { value: 'tap', label: '탭' },
  { value: 'trace', label: '트레이스' },
  { value: 'flick', label: '플릭' },
  { value: 'slide', label: '슬라이드' }
]

export const FLICK_MODE_OPTIONS: { value: FlickMode; label: string }[] = [
  { value: 'directional', label: '5방향' },
  { value: 'any', label: '방향 무관' }
]

export const SLIDE_EASE_OPTIONS: { value: SlideEase; label: string }[] = [
  { value: 'linear', label: '직선' },
  { value: 'easeIn', label: '가속' },
  { value: 'easeOut', label: '감속' }
]
