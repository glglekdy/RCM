import { createWriteStream, promises as fs } from 'node:fs'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { parseSong } from '@rcm/core'
import yauzl, { type Entry, type ZipFile } from 'yauzl'
import { isAudioFile, isChartFileName, makeProjectDir } from './projectFs'

/** 풀었을 때 크기 한도 (음악 포함) */
export const MAX_IMPORT_BYTES = 1024 ** 3

const isZipPath = (v: unknown): v is string =>
  typeof v === 'string' && path.isAbsolute(v) && path.extname(v).toLowerCase() === '.zip'

/** 프로젝트 폴더에서 가져오는 파일. 그 밖의 파일(그림, 실행 파일 등)은 건너뛴다 */
const isProjectFileName = (name: string): boolean =>
  name === 'song.json' || name === 'editor.json' || isChartFileName(name) || isAudioFile(name)

/**
 * 프로젝트 파일이 든 ZIP 안 폴더 (`''` 또는 `'My Song/'`). song.json은 ZIP 바로 안이나 폴더 하나 안에
 * 딱 하나 있어야 한다 (탐색기의 "압축(ZIP) 폴더"는 폴더째 넣는다). macOS가 넣는 `__MACOSX/`는 무시한다.
 */
function projectPrefix(names: readonly string[]): string {
  const songs = names.filter((n) => {
    const parts = n.split('/')
    return parts.length <= 2 && parts[parts.length - 1] === 'song.json' && parts[0] !== '__MACOSX'
  })
  if (songs.length === 0) throw new Error('RCM 프로젝트가 아니에요 (song.json이 없어요)')
  if (songs.length > 1) throw new Error('프로젝트가 여러 개 들어 있어요. ZIP 하나에 프로젝트 하나만 넣어 주세요')
  return songs[0].slice(0, -'song.json'.length)
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

async function listEntries(zip: ZipFile): Promise<Entry[]> {
  const entries: Entry[] = []
  try {
    for await (const entry of zip.eachEntry()) entries.push(entry)
  } catch {
    // yauzl은 `../`나 절대 경로 같은 파일 이름도 여기서 거부한다
    throw new Error('ZIP 파일이 손상됐거나 폴더 밖을 가리키는 경로가 들어 있어요')
  }
  return entries
}

/**
 * 프로젝트 ZIP을 `parentDir` 아래 곡 제목 폴더에 풀고 그 경로를 돌려준다.
 * 프로젝트 파일(song.json, editor.json, `*.chart.json`, 음악)만 풀고, 잘못된 ZIP이면 무엇이 잘못됐는지 적은
 * 오류를 던진다. 풀다가 실패하면 만들던 폴더를 지운다.
 */
export async function importProjectZip(zipPath: string, parentDir: string, limit = MAX_IMPORT_BYTES): Promise<string> {
  if (!isZipPath(zipPath)) throw new Error('ZIP 파일만 가져올 수 있어요')
  let zip: ZipFile
  try {
    zip = await yauzl.openPromise(zipPath, { autoClose: false })
  } catch {
    throw new Error('ZIP 파일을 열 수 없어요')
  }
  try {
    const entries = await listEntries(zip)
    const prefix = projectPrefix(entries.map((e) => e.fileName))
    // 프로젝트 폴더 바로 아래 파일만 (하위 폴더는 건너뛴다)
    const files = entries.filter((e) => {
      if (!e.fileName.startsWith(prefix)) return false
      const name = e.fileName.slice(prefix.length)
      return !name.includes('/') && isProjectFileName(name)
    })
    if (files.some((e) => e.isEncrypted())) throw new Error('암호가 걸린 ZIP은 가져올 수 없어요')
    // 크기는 ZIP에 적힌 값으로 미리 막고, yauzl이 풀면서 실제 크기가 같은지 확인한다
    const total = files.reduce((sum, e) => sum + e.uncompressedSize, 0)
    if (total > limit) throw new Error(`압축을 풀면 너무 커요 (${Math.floor(limit / 1024 ** 2)}MB까지)`)

    const songEntry = files.find((e) => e.fileName === `${prefix}song.json`)!
    const songText = (await readAll(await zip.openReadStreamPromise(songEntry))).toString('utf8')
    const song = parseSong(songText)
    if (!song.ok) throw new Error('song.json을 읽을 수 없어요')

    const dir = await makeProjectDir(parentDir, song.value.title)
    try {
      for (const e of files) {
        const target = path.join(dir, e.fileName.slice(prefix.length))
        // `wx`: 대소문자만 다른 이름이 겹치면 덮어쓰지 않고 실패한다
        if (e === songEntry) await fs.writeFile(target, songText, { flag: 'wx' })
        else await pipeline(await zip.openReadStreamPromise(e), createWriteStream(target, { flags: 'wx' }))
      }
    } catch (err) {
      await fs.rm(dir, { recursive: true, force: true })
      throw err
    }
    return dir
  } finally {
    zip.close()
  }
}
