import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import {
  FORMAT_VERSION,
  emptyEditorData,
  parseChart,
  parseSong,
  serializeChart,
  serializeEditorData,
  serializeSong
} from '@rcm/core'
import type { CreateProjectOptions, ProjectFiles, RecentProject } from '../../shared/api'
import { sanitizeFolderName, uniqueChildName } from './folderName'
import { writeFileAtomic } from './atomicWrite'

export function resolveProjectDir(parentDir: string, title: string): string {
  const name = uniqueChildName(sanitizeFolderName(title), (c) => existsSync(path.join(parentDir, c)))
  return path.join(parentDir, name)
}

export async function createProject(opts: CreateProjectOptions): Promise<string> {
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
      serializeChart({ formatVersion: FORMAT_VERSION, name: opts.chartName, level: 1, lanes: opts.lanes, notes: [] })
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
    const charts: { name: string; lanes: number }[] = []
    for (const c of files.charts) {
      const parsed = parseChart(c.text, c.file)
      if (parsed.ok) charts.push({ name: parsed.value.name, lanes: parsed.value.lanes })
    }
    return { dir, missing: false, title: song.value.title, artist: song.value.artist, charts }
  } catch {
    return { dir, missing: true, title: '', artist: '', charts: [] }
  }
}

const AUDIO_EXTENSIONS = ['.ogg', '.mp3', '.wav']

export async function readAudioFile(file: string): Promise<ArrayBuffer> {
  if (!AUDIO_EXTENSIONS.includes(path.extname(file).toLowerCase())) {
    throw new Error('오디오 파일(ogg, mp3, wav)만 읽을 수 있어요')
  }
  const buf = await fs.readFile(file)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}
