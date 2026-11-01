import 'fake-indexeddb/auto'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FORMAT_VERSION, serializeSong } from '@rcm/core'
import { zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { importProjectZip } from '../../editor/src/main/project/importZip'
import { openRcmDb } from '../src/api/db'
import { createProjects, type ImportedFile, type ProjectDeps } from '../src/api/projects'
import { exportZip, importZip, WEB_ZIP_LIMIT } from '../src/api/zip'

const locks: ProjectDeps['locks'] = {
  async request(_name, _opts, cb) {
    await cb({})
  }
}

let n = 0
const setup = async () => {
  const db = await openRcmDb(`zip-${++n}`)
  let t = 1000
  let u = 0
  return createProjects(db, { locks, now: () => ++t, uuid: () => `id${++u}` })
}

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

const songText = (title: string, audio = 'a (RCM).ogg') =>
  serializeSong({
    formatVersion: FORMAT_VERSION,
    title,
    artist: '가수',
    audio,
    offsetMs: 0,
    previewStartMs: 0,
    timing: [{ tick: 0, bpm: 120, beatsPerMeasure: 4 }]
  })

const SONG = songText('My Song')
const CHART = JSON.stringify({ version: 1, name: 'Hard', notes: [] })
const OGG = new Uint8Array([79, 103, 103, 83, 1, 2, 3])

const tmpDirs: string[] = []
afterEach(async () => {
  for (const d of tmpDirs.splice(0)) await rm(d, { recursive: true, force: true })
})

describe('importZip', () => {
  it('PC 형식 ZIP을 연다', async () => {
    const projects = await setup()
    const zip = zipSync({
      'My Song/song.json': enc(SONG),
      'My Song/hard.chart.json': enc(CHART),
      'My Song/a (RCM).ogg': OGG,
      'My Song/readme.txt': enc('hello'),
      '__MACOSX/My Song/song.json': enc('junk')
    })
    const { dir } = await importZip(projects, zip)
    const files = await projects.listFiles(dir)
    expect(files.map((f) => f.name).sort()).toEqual(['a (RCM).ogg', 'hard.chart.json', 'song.json'])
    expect(await projects.getRecentProjects()).toHaveLength(1)
    const byName = new Map(files.map((f): [string, ImportedFile] => [f.name, f]))
    expect(byName.get('song.json')!.data).toBe(SONG)
    const audio = byName.get('a (RCM).ogg')!.data as Blob
    expect(audio.type).toBe('audio/ogg')
    expect([...new Uint8Array(await audio.arrayBuffer())]).toEqual([...OGG])
  })

  it('폴더 없이 바로 든 ZIP도 연다', async () => {
    const projects = await setup()
    const { dir } = await importZip(projects, zipSync({ 'song.json': enc(SONG), 'x.mp3': OGG, 'y.wav': OGG }))
    const files = await projects.listFiles(dir)
    const type = (name: string) => (files.find((f) => f.name === name)!.data as Blob).type
    expect(type('x.mp3')).toBe('audio/mpeg')
    expect(type('y.wav')).toBe('audio/wav')
  })

  it('0바이트 파일은 열 수 없다고 알려요', async () => {
    const projects = await setup()
    await expect(importZip(projects, new Uint8Array(0))).rejects.toThrow('ZIP 파일을 열 수 없어요')
  })

  it('song.json이 없으면 PC와 같은 문구로 거부해요', async () => {
    const projects = await setup()
    await expect(importZip(projects, zipSync({ 'a.txt': enc('x') }))).rejects.toThrow(
      'RCM 프로젝트가 아니에요 (song.json이 없어요)'
    )
  })

  it('song.json이 두 개면 PC와 같은 문구로 거부해요', async () => {
    const projects = await setup()
    const zip = zipSync({ 'A/song.json': enc(SONG), 'B/song.json': enc(SONG) })
    await expect(importZip(projects, zip)).rejects.toThrow(
      '프로젝트가 여러 개 들어 있어요. ZIP 하나에 프로젝트 하나만 넣어 주세요'
    )
  })

  it.each([
    '../evil.chart.json',
    '/abs/song.json',
    'a/../../b.json',
    'C:/x.json',
    'a\\b.json',
    'bad\u0000name.json',
    'ctl\u0007.json'
  ])('안전하지 않은 항목 %j 이 있으면 손상 문구로 거부해요', async (name) => {
    const projects = await setup()
    const zip = zipSync({ 'song.json': enc(SONG), [name]: enc('{}') })
    await expect(importZip(projects, zip)).rejects.toThrow(
      'ZIP 파일이 손상됐거나 폴더 밖을 가리키는 경로가 들어 있어요'
    )
    expect(await projects.getRecentProjects()).toEqual([])
  })

  it('프로젝트 파일이 아닌 항목이라도 안전하지 않으면 거부해요', async () => {
    const projects = await setup()
    const zip = zipSync({ 'song.json': enc(SONG), '../evil.exe': enc('x') })
    await expect(importZip(projects, zip)).rejects.toThrow('손상됐거나')
  })

  it('한도를 넘으면 풀기 전에 거부해요', async () => {
    const projects = await setup()
    await expect(importZip(projects, zipSync({ 'song.json': enc(SONG) }), 10)).rejects.toThrow(
      '압축을 풀면 너무 커요 (0MB까지)'
    )
    expect(await projects.getRecentProjects()).toEqual([])
  })

  it('한도는 프로젝트 파일만 세요', async () => {
    const projects = await setup()
    const zip = zipSync({ 'song.json': enc(SONG), 'big.txt': new Uint8Array(5000) })
    await expect(importZip(projects, zip, 1000)).resolves.toBeDefined()
  })

  it('기본 한도는 500MB예요', () => {
    expect(WEB_ZIP_LIMIT).toBe(500 * 1024 ** 2)
  })

  it('가져오기 실패 시 프로젝트가 남지 않는다', async () => {
    const projects = await setup()
    await expect(importZip(projects, zipSync({ 'song.json': enc('{broken') }))).rejects.toThrow(
      'song.json을 읽을 수 없어요'
    )
    expect(await projects.getRecentProjects()).toEqual([])
  })

  // 암호가 걸린 항목(일반 목적 비트 0)은 fflate가 UnzipFileInfo에 드러내지 않아 웹에서는 미리 알 수 없다.
  // 암호화된 항목을 풀면 쓰레기가 나오고 song.json 확인에서 'song.json을 읽을 수 없어요'로 거부된다.
})

describe('exportZip', () => {
  it('한글 제목 ZIP을 PC가 그대로 연다', async () => {
    const projects = await setup()
    const title = '봄날 ♪'
    const { dir } = await projects.addImported([
      { name: 'song.json', data: songText(title) },
      { name: 'hard.chart.json', data: CHART },
      { name: 'editor.json', data: '{"zoom":2}' },
      { name: 'a (RCM).ogg', data: new Blob([OGG], { type: 'audio/ogg' }) }
    ])
    const { name, data } = await exportZip(projects, dir)
    expect(name).toBe('봄날 ♪.zip')

    const tmp = await mkdtemp(path.join(os.tmpdir(), 'rcm-zip-'))
    tmpDirs.push(tmp)
    const zipPath = path.join(tmp, 'project.zip')
    await writeFile(zipPath, data)
    const out = path.join(tmp, 'out')
    await mkdir(out)
    const opened = await importProjectZip(zipPath, out)
    expect(path.basename(opened)).toBe(title)
    expect((await readdir(opened)).sort()).toEqual(['a (RCM).ogg', 'editor.json', 'hard.chart.json', 'song.json'])
    expect(await readFile(path.join(opened, 'song.json'), 'utf8')).toBe(songText(title))
    expect(await readFile(path.join(opened, 'hard.chart.json'), 'utf8')).toBe(CHART)
    expect([...(await readFile(path.join(opened, 'a (RCM).ogg')))]).toEqual([...OGG])
  })

  it('내보낸 ZIP을 웹이 다시 열면 같은 파일이에요', async () => {
    const projects = await setup()
    const { dir } = await projects.addImported([
      { name: 'song.json', data: songText('왕복') },
      { name: 'normal.chart.json', data: CHART },
      { name: 'a (RCM).ogg', data: new Blob([OGG], { type: 'audio/ogg' }) }
    ])
    const { data } = await exportZip(projects, dir)
    const again = await importZip(projects, data)
    expect(again.dir).not.toBe(dir)
    const a = (await projects.listFiles(dir)).map((f) => f.name).sort()
    const b = (await projects.listFiles(again.dir)).map((f) => f.name).sort()
    expect(b).toEqual(a)
  })

  it('제목에 쓸 수 없는 글자가 있으면 바꿔요', async () => {
    const projects = await setup()
    const { dir } = await projects.addImported([{ name: 'song.json', data: songText('a/b:c') }])
    expect((await exportZip(projects, dir)).name).toBe('a_b_c.zip')
  })

  it('song.json을 읽을 수 없으면 거부해요', async () => {
    const projects = await setup()
    const { dir } = await projects.addImported([{ name: 'song.json', data: '{broken' }])
    await expect(exportZip(projects, dir)).rejects.toThrow('song.json을 읽을 수 없어요')
  })
})
