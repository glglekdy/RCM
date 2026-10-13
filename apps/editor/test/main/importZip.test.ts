import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { FORMAT_VERSION, serializeSong } from '@rcm/core'
import { importProjectZip } from '../../src/main/project/importZip'

/** 테스트용 ZIP (deflate, UTF-8 이름). 이름은 검사 없이 그대로 넣는다 */
function makeZip(entries: Record<string, string | Buffer>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, content] of Object.entries(entries)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content)
    const packed = zlib.deflateRawSync(data)
    const nameBuf = Buffer.from(name)
    const crc = zlib.crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBuf, packed)
    centrals.push(central, nameBuf)
    offset += local.length + nameBuf.length + packed.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  const count = Object.keys(entries).length
  end.writeUInt16LE(count, 8)
  end.writeUInt16LE(count, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

const song = (title: string): string =>
  serializeSong({
    formatVersion: FORMAT_VERSION,
    title,
    artist: 'A',
    audio: 'audio.mp3',
    offsetMs: 0,
    previewStartMs: 0,
    timing: [{ tick: 0, bpm: 120, beatsPerMeasure: 4 }]
  })

let tmp: string
let parent: string

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-zip-'))
  parent = path.join(tmp, 'projects')
})
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

async function zipFile(entries: Record<string, string | Buffer>, name = 'p.zip'): Promise<string> {
  const file = path.join(tmp, name)
  await fs.writeFile(file, makeZip(entries))
  return file
}

describe('importProjectZip', () => {
  it('ZIP 바로 안의 프로젝트를 곡 제목 폴더로 푼다', async () => {
    const zip = await zipFile({
      'song.json': song('진격: Remix'),
      'editor.json': '{}',
      'hard.chart.json': '{"x":1}',
      'audio.mp3': Buffer.from([1, 2, 3])
    })
    const dir = await importProjectZip(zip, parent)
    expect(dir).toBe(path.join(parent, '진격_ Remix'))
    expect((await fs.readdir(dir)).sort()).toEqual(['audio.mp3', 'editor.json', 'hard.chart.json', 'song.json'])
    expect(await fs.readFile(path.join(dir, 'song.json'), 'utf8')).toBe(song('진격: Remix'))
    expect([...(await fs.readFile(path.join(dir, 'audio.mp3')))]).toEqual([1, 2, 3])
  })

  it('폴더 하나 안에 든 프로젝트도 풀고, 프로젝트 파일이 아닌 것은 건너뛴다', async () => {
    const zip = await zipFile({
      'My Song/': '',
      'My Song/song.json': song('My Song'),
      'My Song/normal.chart.json': '{}',
      'My Song/Audio.OGG': 'ogg',
      'My Song/cover.png': 'png',
      'My Song/run.exe': 'exe',
      'My Song/sub/x.chart.json': '{}',
      'other.chart.json': '{}',
      '__MACOSX/My Song/._song.json': 'junk'
    })
    const dir = await importProjectZip(zip, parent)
    expect((await fs.readdir(dir)).sort()).toEqual(['Audio.OGG', 'normal.chart.json', 'song.json'])
  })

  it('같은 이름 폴더가 있으면 (2)를 붙인다', async () => {
    const zip = await zipFile({ 'song.json': song('dup') })
    expect(await importProjectZip(zip, parent)).toBe(path.join(parent, 'dup'))
    expect(await importProjectZip(zip, parent)).toBe(path.join(parent, 'dup (2)'))
  })

  it('song.json이 없거나 둘이면 거절하고 폴더를 만들지 않는다', async () => {
    await expect(importProjectZip(await zipFile({ 'a.chart.json': '{}' }), parent)).rejects.toThrow('song.json')
    const two = await zipFile({ 'a/song.json': song('a'), 'b/song.json': song('b') }, 'two.zip')
    await expect(importProjectZip(two, parent)).rejects.toThrow('여러 개')
    expect(existsSync(parent) ? await fs.readdir(parent) : []).toEqual([])
  })

  it('song.json을 읽을 수 없으면 거절한다', async () => {
    const zip = await zipFile({ 'song.json': '{broken' })
    await expect(importProjectZip(zip, parent)).rejects.toThrow('song.json')
    expect(existsSync(parent) ? await fs.readdir(parent) : []).toEqual([])
  })

  it('폴더 밖을 가리키는 경로가 있으면 거절한다', async () => {
    const zip = await zipFile({ 'song.json': song('evil'), '../evil.chart.json': '{}' })
    await expect(importProjectZip(zip, parent)).rejects.toThrow()
    expect(existsSync(path.join(tmp, 'evil.chart.json'))).toBe(false)
    expect(existsSync(parent) ? await fs.readdir(parent) : []).toEqual([])
  })

  it('풀었을 때 크기가 한도를 넘으면 거절한다', async () => {
    const zip = await zipFile({ 'song.json': song('big'), 'audio.wav': Buffer.alloc(5000) })
    await expect(importProjectZip(zip, parent, 4000)).rejects.toThrow('너무 커요')
    expect(existsSync(parent) ? await fs.readdir(parent) : []).toEqual([])
  })

  it('ZIP이 아니거나 열 수 없으면 거절한다', async () => {
    const notZip = path.join(tmp, 'x.zip')
    await fs.writeFile(notZip, 'hello')
    await expect(importProjectZip(notZip, parent)).rejects.toThrow('ZIP')
    await expect(importProjectZip(path.join(tmp, 'song.json'), parent)).rejects.toThrow('ZIP')
    await expect(importProjectZip('relative.zip', parent)).rejects.toThrow('ZIP')
  })

  it('중간에 실패하면 만들던 폴더를 지운다', async () => {
    // 대소문자만 다른 두 파일: Windows에서는 같은 파일이라 두 번째 쓰기가 실패한다
    const zip = await zipFile({ 'song.json': song('case'), 'a.chart.json': '{}', 'A.chart.json': '{}' })
    if (process.platform === 'win32') {
      await expect(importProjectZip(zip, parent)).rejects.toThrow()
      expect(await fs.readdir(parent)).toEqual([])
    }
  })
})
