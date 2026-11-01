import { parseSong } from '@rcm/core'
import { unzip, unzipSync, zip, type AsyncZippable, type Unzipped } from 'fflate'
import { extOf, isAudioFile, isProjectFileName, isSafeZipEntry } from '../../../editor/src/shared/project/files'
import { sanitizeFolderName } from '../../../editor/src/shared/project/folderName'
import { projectEntries } from '../../../editor/src/shared/project/zipLayout'
import type { ImportedFile, WebProjects } from './projects'

/** 웹에서 ZIP을 풀었을 때 크기 한도 (음악 포함). PC는 따로 1GB */
export const WEB_ZIP_LIMIT = 500 * 1024 ** 2

const BAD_PATH = 'ZIP 파일이 손상됐거나 폴더 밖을 가리키는 경로가 들어 있어요'

const AUDIO_TYPES: Record<string, string> = { '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' }

/** NUL·제어 문자가 든 이름은 안전하지 않다 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

const isSafeName = (name: string): boolean => isSafeZipEntry(name) && !CONTROL_CHARS.test(name)

/**
 * 항목 이름과 풀었을 때 크기만 읽는다. `filter`가 항상 false라 아무것도 풀지 않는다.
 * ZIP이 아니면 fflate가 던지고, 여기서 "열 수 없어요"로 바꾼다.
 */
function readDirectory(data: Uint8Array): { name: string; originalSize: number }[] {
  const entries: { name: string; originalSize: number }[] = []
  try {
    unzipSync(data, {
      filter(file) {
        entries.push({ name: file.name, originalSize: file.originalSize })
        return false
      }
    })
  } catch {
    throw new Error('ZIP 파일을 열 수 없어요')
  }
  return entries
}

/** 고른 항목만 푼다 (비동기: 큰 음악을 풀어도 화면이 멈추지 않는다) */
function inflate(data: Uint8Array, wanted: ReadonlySet<string>): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(data, { filter: (file) => wanted.has(file.name) }, (err, out) => {
      if (err) reject(new Error('ZIP 파일을 열 수 없어요'))
      else resolve(out)
    })
  })
}

/**
 * 프로젝트 ZIP을 새 프로젝트로 저장한다. 오류 문구는 PC `importProjectZip`와 같다.
 * ZIP을 풀고 `ImportedFile[]`을 다 만든 다음에야 `addImported`(IndexedDB 트랜잭션 하나)를 부르므로,
 * 도중에 실패하면 프로젝트가 남지 않는다.
 *
 * 암호가 걸린 항목(일반 목적 비트 0)은 fflate가 정보로 드러내지 않아 미리 가려내지 못한다.
 * 풀면 쓰레기가 나오므로 song.json 확인에서 'song.json을 읽을 수 없어요'로 거부된다.
 */
export async function importZip(
  projects: WebProjects,
  data: Uint8Array,
  limit: number = WEB_ZIP_LIMIT
): Promise<{ dir: string }> {
  const entries = readDirectory(data)
  if (entries.some((e) => !isSafeName(e.name))) throw new Error(BAD_PATH)
  const { prefix, files: names } = projectEntries(entries.map((e) => e.name))
  const wanted = new Set(names)
  const total = entries.filter((e) => wanted.has(e.name)).reduce((sum, e) => sum + e.originalSize, 0)
  if (total > limit) throw new Error(`압축을 풀면 너무 커요 (${Math.floor(limit / 1024 ** 2)}MB까지)`)

  const unzipped = await inflate(data, wanted)
  const decoder = new TextDecoder()
  const files: ImportedFile[] = []
  for (const full of names) {
    const name = full.slice(prefix.length)
    const bytes = unzipped[full]
    if (!bytes) throw new Error('ZIP 파일을 열 수 없어요')
    if (isAudioFile(name)) files.push({ name, data: new Blob([bytes], { type: AUDIO_TYPES[extOf(name)] }) })
    else files.push({ name, data: decoder.decode(bytes) })
  }
  const song = files.find((f) => f.name === 'song.json')
  if (!song || typeof song.data !== 'string' || !parseSong(song.data).ok) throw new Error('song.json을 읽을 수 없어요')
  return projects.addImported(files)
}

/**
 * 프로젝트를 ZIP으로 묶는다. ZIP 이름과 안쪽 폴더 이름은 곡 제목(`sanitizeFolderName`)이다.
 * PC `buildProjectZip`과 같이 프로젝트 파일만 넣고, 음악은 다시 압축하지 않는다.
 * 저장소를 먼저 다 읽은 뒤에 Blob을 바이트로 바꾸고 묶는다 (IndexedDB 트랜잭션 밖).
 */
export async function exportZip(projects: WebProjects, dir: string): Promise<{ name: string; data: Uint8Array }> {
  const stored = (await projects.listFiles(dir)).filter((f) => isProjectFileName(f.name))
  const songText = stored.find((f) => f.name === 'song.json')?.data
  if (typeof songText !== 'string') throw new Error('song.json을 찾을 수 없어요')
  const song = parseSong(songText)
  if (!song.ok) throw new Error('song.json을 읽을 수 없어요')
  const folder = sanitizeFolderName(song.value.title)

  const encoder = new TextEncoder()
  const zippable: AsyncZippable = {}
  for (const f of stored) {
    const bytes = typeof f.data === 'string' ? encoder.encode(f.data) : new Uint8Array(await f.data.arrayBuffer())
    // 음악은 이미 압축돼 있으므로 다시 압축하지 않는다
    zippable[`${folder}/${f.name}`] = isAudioFile(f.name) ? [bytes, { level: 0 }] : bytes
  }
  const data = await new Promise<Uint8Array>((resolve, reject) => {
    zip(zippable, (err, out) => (err ? reject(err) : resolve(out)))
  })
  return { name: `${folder}.zip`, data }
}
