import { useSyncExternalStore } from 'react'
import { parseAnnouncements, type Announcement } from './parseAnnouncements'

export interface AnnouncementsState {
  /** idle: 아직 안 받음 · loading: 받는 중 (받아 둔 목록이 없을 때만) · error: 받지 못함 */
  status: 'idle' | 'loading' | 'ok' | 'error'
  /** 맨 위가 최신 */
  items: Announcement[]
  /** 이미 본 공지 id */
  seen: string[]
  open: boolean
  /** 이번에 창을 열었을 때 처음 본 공지 id (`새 글` 표시) */
  fresh: string[]
}

let state: AnnouncementsState = { status: 'idle', items: [], seen: [], open: false, fresh: [] }
const listeners = new Set<() => void>()

function set(next: AnnouncementsState): void {
  state = next
  for (const l of listeners) l()
}

export function useAnnouncements(): AnnouncementsState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state
  )
}

/** 사이드바 버튼에 점을 찍을지: 아직 안 본 공지가 있는지 */
export const hasUnseen = (s: AnnouncementsState): boolean => s.items.some((a) => !s.seen.includes(a.id))

let seenLoaded: Promise<void> | null = null
function loadSeen(): Promise<void> {
  seenLoaded ??= window.rcm
    .getSeenAnnouncements()
    .then((seen) => set({ ...state, seen: [...new Set([...seen, ...state.seen])] }))
    .catch(() => {
      // 설정을 못 읽으면 모두 안 본 것으로 둔다
    })
  return seenLoaded
}

let request = 0

/** 공지사항을 다시 받는다. 실패해도 이미 받아 둔 목록은 그대로 보여 준다 */
export async function refreshAnnouncements(): Promise<void> {
  const id = ++request
  if (state.status !== 'ok') set({ ...state, status: 'loading' })
  const [text] = await Promise.all([window.rcm.fetchAnnouncements().catch(() => null), loadSeen()])
  // 그 사이 다시 받기 시작했으면 그쪽 결과를 쓴다
  if (id !== request) return
  if (text === null) {
    if (state.status !== 'ok') set({ ...state, status: 'error' })
    return
  }
  set({ ...state, status: 'ok', items: parseAnnouncements(text) })
  if (state.open) markShownSeen()
}

/** 창에 보이는 공지를 본 것으로 기록한다 */
function markShownSeen(): void {
  const unseen = state.items.filter((a) => !state.seen.includes(a.id)).map((a) => a.id)
  if (unseen.length === 0) return
  set({ ...state, seen: [...state.seen, ...unseen], fresh: [...state.fresh, ...unseen] })
  void window.rcm.markAnnouncementsSeen(unseen.slice(0, 200)).catch(() => {})
}

/** 공지사항 창을 연다. 받아 둔 목록을 바로 보여 주고, 새로 받아 온다 */
export function openAnnouncements(): void {
  set({ ...state, open: true, fresh: [] })
  markShownSeen()
  void refreshAnnouncements()
}

export function closeAnnouncements(): void {
  set({ ...state, open: false })
}
