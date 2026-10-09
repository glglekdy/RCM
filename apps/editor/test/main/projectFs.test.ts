import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseChart, parseSong } from '@rcm/core'
import {
  createProject,
  openProjectFiles,
  summarizeProject,
  writeProjectFiles
} from '../../src/main/project/projectFs'

let tmp: string
let mp3: string
let opts: Parameters<typeof createProject>[0]

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-'))
  mp3 = path.join(tmp, 'x.mp3')
  await fs.writeFile(mp3, Buffer.from([1, 2, 3]))
  opts = { parentDir: tmp, title: 'p', artist: '', audioPath: mp3, bpm: 120, chartName: 'NORMAL', lanes: 4 }
})
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('projectFs', () => {
  it('프로젝트 만들고 다시 열기 (한글 이름)', async () => {
    const dir = await createProject({ ...opts, title: '진격의 승리: Remix?', artist: 'A', bpm: 150, lanes: 7 })
    expect(path.basename(dir)).toBe('진격의 승리_ Remix_')
    const files = await openProjectFiles(dir)
    expect(path.basename(files.audioPath)).toBe('audio.mp3')
    const song = parseSong(files.songText)
    expect(song.ok && song.value.timing).toEqual([{ tick: 0, bpm: 150, beatsPerMeasure: 4 }])
    expect(files.charts.map((c) => c.file)).toEqual(['normal.chart.json'])
    const chart = parseChart(files.charts[0].text, 'normal.chart.json')
    expect(chart.ok && chart.value.lanes).toBe(7)
    expect(files.editorText).not.toBeNull()
  })
  it('같은 이름이면 (2)', async () => {
    await createProject({ ...opts, title: 'dup' })
    expect(path.basename(await createProject({ ...opts, title: 'dup' }))).toBe('dup (2)')
  })
  it('실패하면 폴더를 남기지 않음', async () => {
    await expect(createProject({ ...opts, title: 'bad', audioPath: path.join(tmp, 'none.mp3') })).rejects.toThrow()
    expect(existsSync(path.join(tmp, 'bad'))).toBe(false)
  })
  it('editor.json 없으면 null, song.json 없으면 오류', async () => {
    const dir = await createProject({ ...opts, title: 'noeditor' })
    await fs.rm(path.join(dir, 'editor.json'))
    expect((await openProjectFiles(dir)).editorText).toBeNull()
    await fs.rm(path.join(dir, 'song.json'))
    await expect(openProjectFiles(dir)).rejects.toThrow('song.json')
  })
  it('원자적 저장은 임시 파일을 남기지 않음', async () => {
    await writeProjectFiles(tmp, [{ name: 'x.chart.json', text: '{}\n' }])
    expect(await fs.readFile(path.join(tmp, 'x.chart.json'), 'utf8')).toBe('{}\n')
    expect((await fs.readdir(tmp)).some((f) => f.includes('.tmp-'))).toBe(false)
  })
  it('사라진 프로젝트 요약', async () => {
    expect((await summarizeProject(path.join(tmp, 'gone'))).missing).toBe(true)
  })
})
