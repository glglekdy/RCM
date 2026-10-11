import { useSyncExternalStore } from 'react'
import type { UpdateState } from '../../../shared/api'

/** 앱 전체가 함께 쓰는 업데이트 상태. main이 알려 주는 값을 그대로 따라간다. */
let state: UpdateState = { kind: 'idle' }
const listeners = new Set<() => void>()
let started = false

function set(next: UpdateState): void {
  state = next
  for (const l of listeners) l()
}

/** 앱 시작 때 한 번: 현재 상태를 받아 오고 이후 변경을 구독한다. */
export function startUpdateStore(): void {
  if (started) return
  started = true
  window.rcm.onUpdateState(set)
  window.rcm
    .getUpdateState()
    .then((s) => {
      // 그 사이 이벤트가 먼저 도착했으면 그것이 더 최신이다
      if (state.kind === 'idle') set(s)
    })
    .catch(() => {
      // 상태를 못 받으면 idle로 계속한다
    })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(subscribe, () => state)
}
