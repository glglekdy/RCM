import { useSyncExternalStore } from 'react'
import { RELEASE_NOTES } from './notes'
import { latestNotesVersion, notesHistory, whatsNewVersions } from './versions'

export interface WhatsNewView {
  title: string
  /** 보여 줄 내역 버전들 (최신부터) */
  versions: string[]
  /** 지난 내역 보기: 버전 버튼 목록부터 보이고, 누른 버전의 내역을 보여 준다 */
  history?: boolean
}

let view: WhatsNewView | null = null
const listeners = new Set<() => void>()

function set(next: WhatsNewView | null): void {
  view = next
  for (const l of listeners) l()
}

export function useWhatsNew(): WhatsNewView | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => view
  )
}

export const closeWhatsNew = (): void => set(null)

let checked = false

/**
 * 앱을 켤 때 한 번: 업데이트한 뒤 처음 실행이면 새 버전의 내역을 띄우고, 지금 버전을 본 것으로 기록한다.
 * 처음 설치면 띄우지 않고 기록만 한다.
 */
export async function checkWhatsNew(): Promise<void> {
  // StrictMode에서 effect가 두 번 불려도 한 번만
  if (checked) return
  checked = true
  const [current, seen] = await Promise.all([window.rcm.getAppVersion(), window.rcm.getWhatsNewState()])
  const versions = whatsNewVersions([...RELEASE_NOTES.keys()], current, seen)
  if (seen.lastSeenVersion !== current) await window.rcm.setLastSeenVersion(current)
  if (versions.length > 0) set({ title: `${versions[0]} 버전이 나왔어요!`, versions })
}

/** 사이드바 `업데이트 내역`을 보일지: 지금 버전 이하의 내역이 하나라도 있는지 */
export function hasNotesFor(current: string): boolean {
  return latestNotesVersion([...RELEASE_NOTES.keys()], current) !== null
}

/** 지금 버전 이하의 내역을 버전 버튼 목록으로 띄운다 */
export function openWhatsNew(current: string): void {
  const versions = notesHistory([...RELEASE_NOTES.keys()], current)
  if (versions.length > 0) set({ title: '업데이트 내역', versions, history: true })
}
