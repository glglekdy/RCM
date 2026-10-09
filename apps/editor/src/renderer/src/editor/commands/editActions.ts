import { snapTick, type TimingMap } from '@rcm/core'
import { getChart } from '../state/doc'
import type { EditorStore } from '../state/store'
import { copyNotes, mirrorNotes, pasteClip, removeNotes } from './notes'

export type EditAction = 'copy' | 'cut' | 'paste' | 'delete' | 'mirror'

const PASTE_FAILED = '여기에는 붙여넣을 수 없어요 (겹치거나 레인 수가 달라요)'

/**
 * 선택한 노트에 대한 키보드 편집. 보여 줄 토스트 문구를 돌려준다 (없으면 null).
 * 재생 중에는 채보를 바꾸는 동작(복사 외)을 하지 않는다 — 마우스 편집과 같은 규칙.
 */
export function runEditAction(store: EditorStore, action: EditAction, tm: TimingMap): string | null {
  const s = store.getState()
  const file = s.activeChart
  if (action !== 'copy' && s.playing) return null

  switch (action) {
    case 'copy':
    case 'cut': {
      const clip = copyNotes(getChart(s.doc, file), s.selection)
      if (!clip) return null
      store.set({ clipboard: clip })
      if (action === 'copy') return `${clip.notes.length}개 복사`
      store.apply('잘라내기', removeNotes(s.doc, file, s.selection), file)
      store.set({ selection: new Set() })
      return `${clip.notes.length}개 잘라냄`
    }
    case 'paste': {
      if (!s.clipboard) return null
      const atTick = snapTick(tm, Math.max(0, Math.round(tm.msToTick(s.playheadMs))), s.snap)
      const pasted = pasteClip(s.doc, file, s.clipboard, atTick)
      if (!pasted) return PASTE_FAILED
      store.apply('붙여넣기', pasted.doc, file)
      store.set({ selection: pasted.keys })
      return null
    }
    case 'delete':
      if (store.apply('노트 삭제', removeNotes(s.doc, file, s.selection), file)) {
        store.set({ selection: new Set() })
      }
      return null
    case 'mirror': {
      const mirrored = mirrorNotes(s.doc, file, s.selection)
      if (mirrored && store.apply('좌우 반전', mirrored.doc, file)) {
        store.set({ selection: mirrored.keys })
      }
      return null
    }
  }
}
