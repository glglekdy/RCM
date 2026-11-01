import { useSyncExternalStore } from 'react'
import { clampJudgeOffset } from '../../../shared/settingsRules'

/** 슬라이더를 끄는 동안에는 화면만 바꾸고, 멈춘 뒤 마지막 값만 설정 파일에 쓴다 */
const SAVE_DELAY_MS = 300

/** 판정 오프셋 ms (설정 파일). 불러오기 전에는 0 (꺼짐). */
let offset = 0
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

export async function loadJudgeOffset(): Promise<void> {
  offset = clampJudgeOffset(await window.rcm.getJudgeOffset())
  emit()
}

export function getJudgeOffset(): number {
  return offset
}

export function useJudgeOffset(): number {
  return useSyncExternalStore(subscribe, getJudgeOffset)
}

/** 범위로 잘라 바로 반영하고 잠시 뒤 저장한다. 저장 실패는 경고만 남긴다 (이번 실행 동안은 값 유지). */
export function setJudgeOffset(ms: number): void {
  const next = clampJudgeOffset(ms)
  if (next === offset) return
  offset = next
  emit()
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    window.rcm.setJudgeOffset(offset).catch((err: unknown) => {
      console.warn('판정 오프셋을 저장하지 못했어요', err)
    })
  }, SAVE_DELAY_MS)
}
