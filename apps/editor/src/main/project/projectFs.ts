import { constants as fsConstants, existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { parseSong } from '@rcm/core'
import type { CreateProjectOptions, ProjectFiles, RecentProject } from '../../shared/api'
import { copiedAudioName, isAudioFile, isChartFileName, isCopiedAudioName } from '../../shared/project/files'
import { sanitizeFolderName, uniqueChildName } from '../../shared/project/folderName'
import { buildNewProject, validateCreateProjectOptions as validateOptions } from '../../shared/project/newProject'
import { summarizeProjectFiles } from '../../shared/project/summary'
import { writeFileAtomic } from './atomicWrite'

export { isAudioFile, isChartFileName }

export function resolveProjectDir(parentDir: string, title: string): string {
  const name = uniqueChildName(sanitizeFolderName(title), (c) => existsSync(path.join(parentDir, c)))
  return path.join(parentDir, name)
}

const isAudioPath = (v: unknown): v is string => typeof v === 'string' && path.isAbsolute(v) && isAudioFile(v)

/** `dir`에 아직 없는 복사용 음악 파일 이름 (`곡 (RCM).ogg` …) */
const uniqueAudioName = (dir: string, source: string): string =>
  copiedAudioName(source, (name) => existsSync(path.join(dir, name)))

/** renderer가 보낸 새 프로젝트 옵션을 검사한다 (경로는 절대 경로여야 한다). 규칙은 shared/project/newProject.ts. */
export function validateCreateProjectOptions(raw: unknown): CreateProjectOptions {
  return validateOptions(raw, {
    isParentDir: (v): v is string => typeof v === 'string' && path.isAbsolute(v),
    isAudioSource: isAudioPath
  })
}

/**
 * `parentDir` 아래에 곡 제목으로 새 프로젝트 폴더를 만들고 그 경로를 돌려준다 (이미 있으면 `제목 (2)`…).
 * 폴더 자체는 재귀 없이 만들므로, 실패했을 때 호출한 쪽은 이 폴더만 지우면 된다.
 */
export async function makeProjectDir(parentDir: string, title: string): Promise<string> {
  await fs.mkdir(parentDir, { recursive: true })
  for (;;) {
    const dir = resolveProjectDir(parentDir, title)
    try {
      await fs.mkdir(dir)
      return dir
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    }
  }
}

export async function createProject(raw: CreateProjectOptions): Promise<string> {
  const opts = validateCreateProjectOptions(raw)
  // outside the try: only a directory this call created is ever cleaned up.
  const dir = await makeProjectDir(opts.parentDir, opts.title)
  try {
    let audio = ''
    if (opts.audioPath !== null) {
      audio = uniqueAudioName(dir, opts.audioPath)
      await fs.copyFile(opts.audioPath, path.join(dir, audio))
    }
    for (const f of buildNewProject(opts, audio)) await fs.writeFile(path.join(dir, f.name), f.text)
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
    songText,
    charts,
    editorText
  }
}

function isAllowedFileName(name: string): boolean {
  return name === 'song.json' || name === 'editor.json' || isChartFileName(name)
}

/** 모든 이름이 `dir` 바로 아래의 파일 이름(경로 없음)이고 `allowed`를 통과하는지 확인한다. 하나라도 아니면 throw. */
function checkNames(dir: string, names: string[], allowed: (name: string) => boolean): void {
  const root = path.resolve(dir)
  for (const name of names) {
    if (/[\\/]/.test(name) || path.basename(name) !== name || path.dirname(path.resolve(root, name)) !== root || !allowed(name)) {
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
    return { dir, missing: false, ...summarizeProjectFiles(files.songText, files.charts) }
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

/** 휴지통으로 보내도 되는 프로젝트 폴더인지: song.json이 있는 폴더(절대 경로)만. 다른 폴더를 통째로 지우지 않도록. */
export async function isProjectDir(dir: string): Promise<boolean> {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) return false
  const [folder, song] = await Promise.all([
    fs.stat(dir).catch(() => null),
    fs.stat(path.join(dir, 'song.json')).catch(() => null)
  ])
  return !!folder?.isDirectory() && !!song?.isFile()
}

/**
 * 음악 파일을 프로젝트 폴더에 원래 이름 + ` (RCM)`(`곡 (RCM).mp3`)으로 복사하고 그 이름을 돌려준다.
 * 이전 음악 파일은 Undo로 돌아갈 수 있으므로 지우지 않는다 (다음에 열 때 {@link removeUnusedAudio}가 정리).
 */
export async function importProjectAudio(dir: string, source: string): Promise<string> {
  if (!isAudioPath(source)) throw new Error('음악 파일은 ogg, mp3, wav만 쓸 수 있어요')
  await assertDirectory(dir)
  for (;;) {
    const name = uniqueAudioName(dir, source)
    try {
      await fs.copyFile(source, path.join(dir, name), fsConstants.COPYFILE_EXCL)
      return name
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    }
  }
}

/**
 * song.json이 가리키지 않는, 에디터가 복사해 넣은 음악 파일(`… (RCM).<ext>`, 예전 `audio[-n].<ext>`)을 지운다.
 * 음악을 바꾸고 저장하지 않았거나 바꾼 뒤 저장해 남은 파일들이다. song.json을 읽지 못하면 아무것도 지우지 않는다.
 */
export async function removeUnusedAudio(dir: string, songText: string): Promise<void> {
  const song = parseSong(songText)
  if (!song.ok) return
  const keep = song.value.audio.toLowerCase()
  for (const name of await fs.readdir(dir)) {
    if (isCopiedAudioName(name) && name.toLowerCase() !== keep) {
      await fs.rm(path.join(dir, name), { force: true })
    }
  }
}

export async function readAudioFile(file: string): Promise<ArrayBuffer> {
  if (!isAudioFile(file)) {
    throw new Error('오디오 파일(ogg, mp3, wav)만 읽을 수 있어요')
  }
  const buf = await fs.readFile(file)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}
