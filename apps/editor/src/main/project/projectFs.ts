import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import {
  FORMAT_VERSION,
  emptyEditorData,
  parseChart,
  parseSong,
  serializeChart,
  serializeEditorData,
  serializeSong,
  trackErrors,
  type Track
} from '@rcm/core'
import type { CreateProjectOptions, ProjectFiles, RecentProject } from '../../shared/api'
import { sanitizeFolderName, uniqueChildName } from './folderName'
import { writeFileAtomic } from './atomicWrite'

export function resolveProjectDir(parentDir: string, title: string): string {
  const name = uniqueChildName(sanitizeFolderName(title), (c) => existsSync(path.join(parentDir, c)))
  return path.join(parentDir, name)
}

const AUDIO_EXTENSIONS = ['.ogg', '.mp3', '.wav']

const isAudioFile = (file: string): boolean => AUDIO_EXTENSIONS.includes(path.extname(file).toLowerCase())

/**
 * renderer가 보낸 새 프로젝트 옵션을 검사해 알려진 키만 돌려준다 (renderer는 신뢰 경계 밖).
 * 잘못됐으면 무엇이 잘못됐는지 적은 오류를 던진다.
 */
export function validateCreateProjectOptions(raw: unknown): CreateProjectOptions {
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
  if (typeof parentDir !== 'string' || !path.isAbsolute(parentDir)) {
    throw new Error('저장 위치가 올바르지 않아요')
  }
  const audioPath = o.audioPath
  if (typeof audioPath !== 'string' || !path.isAbsolute(audioPath) || !isAudioFile(audioPath)) {
    throw new Error('음악 파일은 ogg, mp3, wav만 쓸 수 있어요')
  }
  const bpm = o.bpm
  if (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm <= 0) {
    throw new Error('BPM은 0보다 큰 숫자여야 해요')
  }
  const errors = trackErrors(o.tracks, 'tracks')
  if (errors.length > 0) throw new Error(`트랙 목록이 올바르지 않아요 (${errors[0]})`)
  const tracks = (o.tracks as Track[]).map(({ id, color, width }) => {
    const t: Track = { id }
    if (color !== undefined) t.color = color
    if (width !== undefined) t.width = width
    return t
  })
  return { parentDir, title, artist, audioPath, bpm, chartName, tracks }
}

export async function createProject(raw: CreateProjectOptions): Promise<string> {
  const opts = validateCreateProjectOptions(raw)
  await fs.mkdir(opts.parentDir, { recursive: true })
  // mkdir is non-recursive and outside the try: only a directory this call created is ever cleaned up.
  let dir: string
  for (;;) {
    dir = resolveProjectDir(opts.parentDir, opts.title)
    try {
      await fs.mkdir(dir)
      break
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    }
  }
  try {
    const audio = `audio${path.extname(opts.audioPath).toLowerCase()}`
    await fs.copyFile(opts.audioPath, path.join(dir, audio))
    await fs.writeFile(
      path.join(dir, 'song.json'),
      serializeSong({
        formatVersion: FORMAT_VERSION,
        title: opts.title,
        artist: opts.artist,
        audio,
        offsetMs: 0,
        previewStartMs: 0,
        timing: [{ tick: 0, bpm: opts.bpm, beatsPerMeasure: 4 }]
      })
    )
    const chartFile = `${sanitizeFolderName(opts.chartName.toLowerCase())}.chart.json`
    await fs.writeFile(
      path.join(dir, chartFile),
      serializeChart({ formatVersion: FORMAT_VERSION, name: opts.chartName, level: 1, tracks: opts.tracks, notes: [] })
    )
    await fs.writeFile(path.join(dir, 'editor.json'), serializeEditorData(emptyEditorData()))
    return dir
  } catch (e) {
    await fs.rm(dir, { recursive: true, force: true })
    throw e
  }
}

export async function openProjectFiles(dir: string): Promise<ProjectFiles> {
  let songText: string
  try {
    songText = await fs.readFile(path.join(dir, 'song.json'), 'utf8')
  } catch {
    throw new Error('song.json을 찾을 수 없어요')
  }
  let audio: unknown
  try {
    audio = (JSON.parse(songText) as { audio?: unknown }).audio
  } catch {
    audio = undefined
  }
  const names = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.chart.json')).sort()
  const charts = await Promise.all(
    names.map(async (file) => ({ file, text: await fs.readFile(path.join(dir, file), 'utf8') }))
  )
  let editorText: string | null = null
  try {
    editorText = await fs.readFile(path.join(dir, 'editor.json'), 'utf8')
  } catch {
    editorText = null
  }
  return {
    dir,
    audioPath: typeof audio === 'string' ? path.join(dir, audio) : '',
    songText,
    charts,
    editorText
  }
}

const isChartFileName = (name: string): boolean => name.toLowerCase().endsWith('.chart.json')

function isAllowedFileName(name: string): boolean {
  return name === 'song.json' || name === 'editor.json' || isChartFileName(name)
}

/** 모든 이름이 `dir` 바로 아래의 파일 이름(경로 없음)이고 `allowed`를 통과하는지 확인한다. 하나라도 아니면 throw. */
function checkNames(dir: string, names: string[], allowed: (name: string) => boolean): void {
  const root = path.resolve(dir)
  for (const name of names) {
    if (path.basename(name) !== name || path.dirname(path.resolve(root, name)) !== root || !allowed(name)) {
      throw new Error(`허용되지 않는 파일 이름이에요: ${name}`)
    }
  }
}

export async function writeProjectFiles(dir: string, files: { name: string; text: string }[]): Promise<void> {
  checkNames(
    dir,
    files.map((f) => f.name),
    isAllowedFileName
  )
  for (const f of files) await writeFileAtomic(path.join(dir, f.name), f.text)
}

/** 문서에서 사라진 채보 파일을 지운다. `*.chart.json`만, 프로젝트 폴더 바로 아래 것만 지울 수 있다. */
export async function deleteProjectFiles(dir: string, names: string[]): Promise<void> {
  checkNames(dir, names, isChartFileName)
  for (const name of names) await fs.rm(path.join(dir, name), { force: true })
}

export async function summarizeProject(dir: string): Promise<Omit<RecentProject, 'lastOpened'>> {
  try {
    const files = await openProjectFiles(dir)
    const song = parseSong(files.songText)
    if (!song.ok) throw new Error('invalid song')
    const charts: RecentProject['charts'] = []
    for (const c of files.charts) {
      const parsed = parseChart(c.text, c.file)
      if (parsed.ok) charts.push({ name: parsed.value.name, trackCount: parsed.value.tracks.length })
    }
    return { dir, missing: false, title: song.value.title, artist: song.value.artist, charts }
  } catch {
    return { dir, missing: true, title: '', artist: '', charts: [] }
  }
}

/** 탐색기로 열 경로가 이미 있는 폴더(절대 경로)인지 확인한다. 아니면 throw (파일을 실행하지 않도록). */
export async function assertDirectory(dir: string): Promise<void> {
  const stat =
    typeof dir === 'string' && path.isAbsolute(dir) ? await fs.stat(dir).catch(() => null) : null
  if (!stat?.isDirectory()) throw new Error('폴더를 찾을 수 없어요')
}

export async function readAudioFile(file: string): Promise<ArrayBuffer> {
  if (!isAudioFile(file)) {
    throw new Error('오디오 파일(ogg, mp3, wav)만 읽을 수 있어요')
  }
  const buf = await fs.readFile(file)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}
