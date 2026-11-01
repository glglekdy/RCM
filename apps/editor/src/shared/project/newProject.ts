import {
  FORMAT_VERSION,
  emptyEditorData,
  MAX_COLUMNS,
  MIN_COLUMNS,
  serializeChart,
  serializeEditorData,
  serializeFreeChart,
  serializeSong,
  trackErrors,
  type Track
} from '@rcm/core'
import type { CreateProjectOptions } from '../api'
import { sanitizeFolderName } from './folderName'

/** 경로 검사는 환경(PC: 절대 경로, 웹: 의미 없는 값)마다 달라서 호출한 쪽이 정한다. */
export interface CreateRules {
  isParentDir(v: unknown): v is string
  isAudioSource(v: unknown): v is string
}

/**
 * renderer가 보낸 새 프로젝트 옵션을 검사해 알려진 키만 돌려준다 (renderer는 신뢰 경계 밖).
 * 잘못됐으면 무엇이 잘못됐는지 적은 오류를 던진다.
 */
export function validateCreateProjectOptions(raw: unknown, rules: CreateRules): CreateProjectOptions {
  if (typeof raw !== 'object' || raw === null) throw new Error('새 프로젝트 옵션이 올바르지 않아요')
  const o = raw as Record<string, unknown>
  const text = (key: string, label: string, nonEmpty: boolean): string => {
    const v = o[key]
    if (typeof v !== 'string' || (nonEmpty && v.trim() === '')) {
      throw new Error(nonEmpty ? `${label}을(를) 입력해 주세요` : `${label}이(가) 올바르지 않아요`)
    }
    return v
  }
  const title = text('title', '제목', true)
  const artist = text('artist', '아티스트', false)
  const chartName = text('chartName', '난이도 이름', true)
  const parentDir = o.parentDir
  if (!rules.isParentDir(parentDir)) throw new Error('저장 위치가 올바르지 않아요')
  // 음악은 나중에 골라도 된다 (null = 음악 없음)
  const audioPath = o.audioPath ?? null
  if (audioPath !== null && !rules.isAudioSource(audioPath)) {
    throw new Error('음악 파일은 ogg, mp3, wav만 쓸 수 있어요')
  }
  const bpm = o.bpm
  if (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm <= 0) {
    throw new Error('BPM은 0보다 큰 숫자여야 해요')
  }
  if (o.free !== undefined) {
    const f = o.free as Record<string, unknown> | null
    const columns = f?.columns
    if (typeof columns !== 'number' || !Number.isInteger(columns) || columns < MIN_COLUMNS || columns > MAX_COLUMNS) {
      throw new Error(`칸 수는 ${MIN_COLUMNS}~${MAX_COLUMNS} 사이 정수여야 해요`)
    }
    if (f?.flickMode !== 'directional' && f?.flickMode !== 'any') throw new Error('플릭 방식이 올바르지 않아요')
    return { parentDir, title, artist, audioPath, bpm, chartName, tracks: [], free: { columns, flickMode: f.flickMode } }
  }
  const errors = trackErrors(o.tracks, 'tracks')
  if (errors.length > 0) throw new Error(`트랙 목록이 올바르지 않아요 (${errors[0]})`)
  // 예전 width는 버리고, kind는 기믹일 때만 남긴다
  const tracks = (o.tracks as Track[]).map(({ id, color, kind }) => {
    const t: Track = { id }
    if (color !== undefined) t.color = color
    if (kind === 'gimmick') t.kind = kind
    return t
  })
  return { parentDir, title, artist, audioPath, bpm, chartName, tracks }
}

/** 새 프로젝트의 파일들: song.json, 첫 채보(`<난이도 이름>.chart.json`), editor.json. `audio`는 복사한 음악 파일 이름(없으면 ''). */
export function buildNewProject(opts: CreateProjectOptions, audio: string): { name: string; text: string }[] {
  const song = serializeSong({
    formatVersion: FORMAT_VERSION,
    title: opts.title,
    artist: opts.artist,
    audio,
    offsetMs: 0,
    previewStartMs: 0,
    timing: [{ tick: 0, bpm: opts.bpm, beatsPerMeasure: 4 }]
  })
  const base = { formatVersion: 1 as const, name: opts.chartName, level: 1, notes: [] }
  const chart = opts.free
    ? serializeFreeChart({ ...base, layout: 'free', ...opts.free })
    : serializeChart({ ...base, tracks: opts.tracks })
  return [
    { name: 'song.json', text: song },
    { name: `${sanitizeFolderName(opts.chartName.toLowerCase())}.chart.json`, text: chart },
    { name: 'editor.json', text: serializeEditorData(emptyEditorData()) }
  ]
}
