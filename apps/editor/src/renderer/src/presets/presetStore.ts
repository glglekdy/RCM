import { useSyncExternalStore } from 'react'
import { DEFAULT_PRESETS, type TrackPreset } from '../../../shared/presets'

/** 앱 전체가 함께 쓰는 트랙 프리셋 (설정 파일). 불러오기 전에는 기본 프리셋. */
let presets: readonly TrackPreset[] = DEFAULT_PRESETS
let lastPresetId: string | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function loadPresets(): Promise<void> {
  const r = await window.rcm.getPresets()
  presets = r.presets
  lastPresetId = r.lastPresetId
  emit()
}

export function getPresets(): readonly TrackPreset[] {
  return presets
}

export function getLastPresetId(): string | null {
  return lastPresetId
}

/** 바로 반영하고 저장한다. 저장에 실패하면 이전 목록으로 되돌리고 오류를 던진다. */
export async function savePresets(next: TrackPreset[]): Promise<void> {
  const prev = presets
  presets = next
  emit()
  try {
    await window.rcm.savePresets(next)
  } catch (err) {
    // 그 사이 다른 저장이 반영됐으면 그것을 덮지 않는다
    if (presets === next) {
      presets = prev
      emit()
    }
    throw err
  }
}

export function setLastPresetId(id: string): Promise<void> {
  lastPresetId = id
  return window.rcm.setLastPresetId(id)
}

/** 새 프로젝트·난이도 추가 창의 처음 선택: 마지막으로 고른 프리셋, 없으면 첫 프리셋. */
export function defaultPresetId(list: readonly TrackPreset[]): string {
  return list.some((p) => p.id === lastPresetId) ? (lastPresetId as string) : list[0].id
}

export function usePresets(): readonly TrackPreset[] {
  return useSyncExternalStore(subscribe, getPresets)
}
