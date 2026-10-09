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

export function resolveProjectDir(parentDir: string, title: string): string {
  const name = uniqueChildName(sanitizeFolderName(title), (c) => existsSync(path.join(parentDir, c)))
  return path.join(parentDir, name)
}

export async function createProject(opts: CreateProjectOptions): Promise<string> {
  await fs.mkdir(opts.parentDir, { recursive: true })
  const dir = resolveProjectDir(opts.parentDir, opts.title)
  try {
    await fs.mkdir(dir)
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

export async function writeProjectFiles(dir: string, files: { name: string; text: string }[]): Promise<void> {
  for (const f of files) {
    const target = path.join(dir, f.name)
    const tmp = `${target}.tmp-${process.pid}`
    try {
      await fs.writeFile(tmp, f.text, 'utf8')
      await fs.rename(tmp, target)
    } catch (e) {
      await fs.rm(tmp, { force: true })
      throw e
    }
  }
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
