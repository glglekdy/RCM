import { lastNoteEndTick, type TimingMap } from '@rcm/core'
import type { ProjectDoc } from '../state/doc'

/** 음악이 없을 때 타임라인 길이의 최소값 (3분) */
export const SILENT_MIN_MS = 3 * 60_000
/** 음악이 없을 때 마지막 노트 뒤에 남겨 두는 여유 */
const SILENT_TAIL_MS = 10_000

/** 프로젝트 폴더 안 음악 파일(song.json의 `audio`)의 경로. 폴더 경로의 구분자를 따른다. */
export function projectAudioPath(dir: string, audio: string): string {
  const sep = dir.includes('\\') ? '\\' : '/'
  return dir.endsWith(sep) ? dir + audio : dir + sep + audio
}

/** 음악 없이 편집할 때의 곡 길이: 기본 3분, 노트가 더 뒤에 있으면 마지막 노트 끝 + 10초. */
export function silentDurationMs(doc: ProjectDoc, tm: TimingMap): number {
  let lastTick = 0
  for (const { chart } of doc.charts) {
    lastTick = Math.max(lastTick, lastNoteEndTick(chart))
  }
  return Math.max(SILENT_MIN_MS, tm.tickToMs(lastTick) + SILENT_TAIL_MS)
}
