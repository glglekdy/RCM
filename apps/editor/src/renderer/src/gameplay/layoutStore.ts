import { useSyncExternalStore } from 'react'
import { DEFAULT_LAYOUT, layoutEquals, type PlayfieldLayout } from '@rcm/playfield'

/** 슬라이더를 끄는 동안에는 화면만 바꾸고, 멈춘 뒤 마지막 값만 설정 파일에 쓴다 */
const SAVE_DELAY_MS = 300

/** 게임플레이 레이아웃 (설정 파일). 불러오기 전에는 기본값. */
let layout: PlayfieldLayout = { ...DEFAULT_LAYOUT }
let saveTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(): void {
  for (const l of listeners) l()
}

export async function loadLayout(): Promise<void> {
  layout = await window.rcm.getGameplayLayout()
  emit()
}

export function getLayout(): PlayfieldLayout {
  return layout
}

export function useLayout(): PlayfieldLayout {
  return useSyncExternalStore(subscribe, getLayout)
}

/** 바로 반영하고 잠시 뒤 저장한다. 저장 실패는 경고만 남긴다 (이번 실행 동안은 값 유지). */
export function setLayout(next: PlayfieldLayout): void {
  if (layoutEquals(layout, next)) return
  layout = next
  emit()
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    window.rcm.setGameplayLayout(layout).catch((err: unknown) => {
      console.warn('게임플레이 설정을 저장하지 못했어요', err)
    })
  }, SAVE_DELAY_MS)
}
