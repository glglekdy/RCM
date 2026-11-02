import { useSyncExternalStore } from 'react'

/** 자동 저장 (설정 파일). 불러오기 전에는 기본값 켜짐. */
let enabled = true
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

export async function loadAutoSave(): Promise<void> {
  enabled = await window.rcm.getAutoSave()
  emit()
}

export function getAutoSave(): boolean {
  return enabled
}

export function useAutoSave(): boolean {
  return useSyncExternalStore(subscribe, getAutoSave)
}

/** 바로 반영하고 저장한다. 저장 실패는 경고만 남긴다 (이번 실행 동안은 값 유지). */
export function setAutoSave(next: boolean): void {
  if (next === enabled) return
  enabled = next
  emit()
  window.rcm.setAutoSave(next).catch((err: unknown) => {
    console.warn('자동 저장 설정을 저장하지 못했어요', err)
  })
}
