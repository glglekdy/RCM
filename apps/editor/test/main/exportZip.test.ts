import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { unzipSync } from 'fflate'
import { FORMAT_VERSION, serializeSong } from '@rcm/core'
import { buildProjectZip } from '../../src/main/project/exportZip'
import { importProjectZip } from '../../src/main/project/importZip'

const song = (title: string): string =>
  serializeSong({
    formatVersion: FORMAT_VERSION,
    title,
    artist: 'A',
    audio: '봄날 (RCM).mp3',
    offsetMs: 0,
    previewStartMs: 0,
    timing: [{ tick: 0, bpm: 120, beatsPerMeasure: 4 }]
  })

let tmp: string
let project: string

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-export-'))
  project = path.join(tmp, 'some-folder')
  await fs.mkdir(path.join(project, 'sub'), { recursive: true })
  await fs.writeFile(path.join(project, 'song.json'), song('봄날 ♪'))
  await fs.writeFile(path.join(project, 'hard.chart.json'), '{"x":1}')
  await fs.writeFile(path.join(project, 'editor.json'), '{}')
  await fs.writeFile(path.join(project, '봄날 (RCM).mp3'), Buffer.from([1, 2, 3, 4]))
  await fs.writeFile(path.join(project, 'notes.txt'), 'memo')
  await fs.writeFile(path.join(project, 'sub', 'x.chart.json'), '{}')
})
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('buildProjectZip', () => {
  it('곡 제목 이름의 ZIP에 프로젝트 파일만 폴더 안에 담는다', async () => {
    const { name, data } = await buildProjectZip(project)
    expect(name).toBe('봄날 ♪.zip')
    expect(Object.keys(unzipSync(data)).sort()).toEqual(
      ['봄날 ♪/song.json', '봄날 ♪/hard.chart.json', '봄날 ♪/editor.json', '봄날 ♪/봄날 (RCM).mp3'].sort()
    )
  })

  it('폴더에 쓸 수 없는 글자는 바꾼다', async () => {
    await fs.writeFile(path.join(project, 'song.json'), song('A: B/C'))
    const { name, data } = await buildProjectZip(project)
    expect(name).toBe('A_ B_C.zip')
    expect(Object.keys(unzipSync(data)).every((n) => n.startsWith('A_ B_C/'))).toBe(true)
  })

  it('다시 가져오면 같은 파일 내용이 나온다', async () => {
    const { data } = await buildProjectZip(project)
    const zipPath = path.join(tmp, 'out.zip')
    await fs.writeFile(zipPath, data)
    const dir = await importProjectZip(zipPath, path.join(tmp, 'imported'))
    expect((await fs.readdir(dir)).sort()).toEqual(['editor.json', 'hard.chart.json', 'song.json', '봄날 (RCM).mp3'])
    expect(await fs.readFile(path.join(dir, 'song.json'), 'utf8')).toBe(song('봄날 ♪'))
    expect(await fs.readFile(path.join(dir, 'hard.chart.json'), 'utf8')).toBe('{"x":1}')
    expect([...(await fs.readFile(path.join(dir, '봄날 (RCM).mp3')))]).toEqual([1, 2, 3, 4])
  })

  it('song.json을 읽을 수 없으면 reject한다', async () => {
    await fs.rm(path.join(project, 'song.json'))
    await expect(buildProjectZip(project)).rejects.toThrow('song.json을 찾을 수 없어요')
  })
})
