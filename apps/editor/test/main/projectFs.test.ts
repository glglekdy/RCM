import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { basicTracks, parseChart, parseSong } from '@rcm/core'
import {
  assertDirectory,
  createProject,
  deleteProjectFiles,
  importProjectAudio,
  openProjectFiles,
  readAudioFile,
  removeUnusedAudio,
  summarizeProject,
  validateCreateProjectOptions,
  writeProjectFiles
} from '../../src/main/project/projectFs'

let tmp: string
let mp3: string
let opts: Parameters<typeof createProject>[0]

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-'))
  mp3 = path.join(tmp, 'x.mp3')
  await fs.writeFile(mp3, Buffer.from([1, 2, 3]))
  opts = { parentDir: tmp, title: 'p', artist: '', audioPath: mp3, bpm: 120, chartName: 'NORMAL', tracks: basicTracks(4) }
})
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('projectFs', () => {
  it('프로젝트 만들고 다시 열기 (한글 이름)', async () => {
    const dir = await createProject({ ...opts, title: '진격의 승리: Remix?', artist: 'A', bpm: 150, tracks: basicTracks(7) })
    expect(path.basename(dir)).toBe('진격의 승리_ Remix_')
    const files = await openProjectFiles(dir)
    const song = parseSong(files.songText)
    expect(song.ok && song.value.audio).toBe('audio.mp3')
    expect(existsSync(path.join(dir, 'audio.mp3'))).toBe(true)
    expect(song.ok && song.value.timing).toEqual([{ tick: 0, bpm: 150, beatsPerMeasure: 4 }])
    expect(files.charts.map((c) => c.file)).toEqual(['normal.chart.json'])
    const chart = parseChart(files.charts[0].text, 'normal.chart.json')
    expect(chart.ok && chart.value.tracks).toEqual(basicTracks(7))
    expect(files.editorText).not.toBeNull()
  })
  it('트랙 프리셋으로 프로젝트 만들기', async () => {
    const dir = await createProject({
      ...opts,
      title: 'side',
      tracks: [{ id: 'Side_L', color: '#f59e0b', kind: 'gimmick' }, { id: 'Note_1' }]
    })
    const chart = parseChart((await openProjectFiles(dir)).charts[0].text, 'normal.chart.json')
    expect(chart.ok && chart.value.tracks.map((t) => t.id)).toEqual(['Side_L', 'Note_1'])
    expect(chart.ok && chart.value.tracks[0]).toEqual({ id: 'Side_L', color: '#f59e0b', kind: 'gimmick' })
    expect((await summarizeProject(dir)).charts).toEqual([{ name: 'NORMAL', trackCount: 2 }])
  })
  it('음악 없이 프로젝트 만들기', async () => {
    const dir = await createProject({ ...opts, title: 'silent', audioPath: null })
    const song = parseSong((await openProjectFiles(dir)).songText)
    expect(song.ok && song.value.audio).toBe('')
    expect((await fs.readdir(dir)).sort()).toEqual(['editor.json', 'normal.chart.json', 'song.json'])
  })
  it('음악을 새 이름으로 복사해 넣고, 이전 파일은 남김', async () => {
    const dir = await createProject({ ...opts, title: 'swap' })
    const ogg = path.join(tmp, 'y.ogg')
    await fs.writeFile(ogg, Buffer.from([4, 5]))
    expect(await importProjectAudio(dir, ogg)).toBe('audio.ogg')
    expect(await importProjectAudio(dir, mp3)).toBe('audio-2.mp3')
    expect(await importProjectAudio(dir, mp3)).toBe('audio-3.mp3')
    expect(await fs.readFile(path.join(dir, 'audio.mp3'))).toEqual(Buffer.from([1, 2, 3]))
    expect(await fs.readFile(path.join(dir, 'audio.ogg'))).toEqual(Buffer.from([4, 5]))
    await expect(importProjectAudio(dir, path.join(tmp, 'x.exe'))).rejects.toThrow('음악 파일')
    await expect(importProjectAudio(dir, 'x.mp3')).rejects.toThrow('음악 파일')
    await expect(importProjectAudio(path.join(tmp, 'gone'), mp3)).rejects.toThrow('폴더')
  })
  it('song.json이 가리키지 않는 에디터 음악 파일만 정리', async () => {
    const dir = await createProject({ ...opts, title: 'clean' })
    for (const f of ['audio.ogg', 'audio-2.mp3', 'AUDIO-3.WAV', 'my song.mp3', 'audio-x.mp3', 'audio.txt']) {
      await fs.writeFile(path.join(dir, f), 'x')
    }
    const songText = (await openProjectFiles(dir)).songText
    await removeUnusedAudio(dir, songText.replace('"audio.mp3"', '"audio-2.mp3"'))
    expect((await fs.readdir(dir)).filter((f) => !f.endsWith('.json')).sort()).toEqual([
      'audio-2.mp3',
      'audio-x.mp3',
      'audio.txt',
      'my song.mp3'
    ])
    // song.json을 읽지 못하면 아무것도 지우지 않는다
    await removeUnusedAudio(dir, '{')
    await removeUnusedAudio(dir, '{"audio": "audio-2.mp3"}')
    expect(existsSync(path.join(dir, 'audio-2.mp3'))).toBe(true)
  })
  it('잘못된 트랙이면 만들지 않음', async () => {
    await expect(createProject({ ...opts, title: 'bad', tracks: [{ id: 'A' }, { id: 'A' }] })).rejects.toThrow()
    expect(existsSync(path.join(tmp, 'bad'))).toBe(false)
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
  it('프로젝트 밖으로 쓰기를 거부', async () => {
    const dir = path.join(tmp, 'proj')
    await fs.mkdir(dir)
    await expect(writeProjectFiles(dir, [{ name: '../evil.json', text: 'x' }])).rejects.toThrow()
    await expect(writeProjectFiles(dir, [{ name: 'a.txt', text: 'x' }])).rejects.toThrow()
    expect(existsSync(path.join(tmp, 'evil.json'))).toBe(false)
    expect(await fs.readdir(dir)).toEqual([])
  })
  it('오디오 확장자만 읽음', async () => {
    expect((await readAudioFile(mp3)).byteLength).toBe(3)
    await fs.writeFile(path.join(tmp, 'a.json'), '{}')
    await expect(readAudioFile(path.join(tmp, 'a.json'))).rejects.toThrow()
  })
  it('동시에 만들어도 서로의 폴더를 지우지 않음', async () => {
    const [a, b] = await Promise.all([
      createProject({ ...opts, title: 'race' }),
      createProject({ ...opts, title: 'race' })
    ])
    expect(a).not.toBe(b)
    expect(existsSync(path.join(a, 'song.json'))).toBe(true)
    expect(existsSync(path.join(b, 'song.json'))).toBe(true)
  })
  it('동시에 같은 파일을 저장해도 임시 파일이 겹치지 않음', async () => {
    const writes = Array.from({ length: 8 }, (_, i) =>
      writeProjectFiles(tmp, [{ name: 'x.chart.json', text: `${i}\n` }])
    )
    await expect(Promise.all(writes)).resolves.toBeDefined()
    expect(await fs.readFile(path.join(tmp, 'x.chart.json'), 'utf8')).toMatch(/^\d\n$/)
    expect((await fs.readdir(tmp)).some((f) => f.includes('.tmp-'))).toBe(false)
  })
  it('문서에서 사라진 채보 파일을 지움', async () => {
    const dir = await createProject({ ...opts, title: 'del' })
    await writeProjectFiles(dir, [{ name: 'hard.chart.json', text: '{}\n' }])
    await deleteProjectFiles(dir, ['hard.chart.json'])
    expect(existsSync(path.join(dir, 'hard.chart.json'))).toBe(false)
    expect(existsSync(path.join(dir, 'normal.chart.json'))).toBe(true)
    // 이미 없는 파일은 그냥 넘어간다
    await expect(deleteProjectFiles(dir, ['hard.chart.json'])).resolves.toBeUndefined()
  })
  it('채보 파일이 아니거나 프로젝트 밖이면 하나도 지우지 않음', async () => {
    const dir = path.join(tmp, 'proj')
    await fs.mkdir(dir)
    await fs.writeFile(path.join(dir, 'a.chart.json'), '{}')
    await fs.writeFile(path.join(dir, 'song.json'), '{}')
    await fs.writeFile(path.join(dir, 'editor.json'), '{}')
    await fs.writeFile(path.join(tmp, 'outside.chart.json'), '{}')
    for (const bad of ['../outside.chart.json', '..\\outside.chart.json', 'song.json', 'editor.json', 'audio.ogg', 'sub/x.chart.json', path.join(tmp, 'outside.chart.json')]) {
      await expect(deleteProjectFiles(dir, ['a.chart.json', bad])).rejects.toThrow('허용되지 않는')
    }
    expect((await fs.readdir(dir)).sort()).toEqual(['a.chart.json', 'editor.json', 'song.json'])
    expect(existsSync(path.join(tmp, 'outside.chart.json'))).toBe(true)
  })
  it('새 프로젝트 옵션 검사', () => {
    expect(validateCreateProjectOptions(opts)).toEqual(opts)
    // 알려진 키만 남긴다
    expect(validateCreateProjectOptions({ ...opts, extra: 1 })).toEqual(opts)
    // 음악은 생략할 수 있다
    expect(validateCreateProjectOptions({ ...opts, audioPath: null }).audioPath).toBeNull()
    expect(validateCreateProjectOptions({ ...opts, audioPath: undefined }).audioPath).toBeNull()
    // 트랙도 알려진 필드만 남긴다 (예전 width는 버린다)
    const tracks = [
      { id: 'Side_L', color: '#f59e0b', width: 'wide', key: 'ShiftLeft' },
      { id: 'G', kind: 'gimmick', width: 'huge' },
      { id: 'Note_1', kind: 'play' }
    ]
    expect(validateCreateProjectOptions({ ...opts, tracks }).tracks).toEqual([
      { id: 'Side_L', color: '#f59e0b' },
      { id: 'G', kind: 'gimmick' },
      { id: 'Note_1' }
    ])
    const bad: [Record<string, unknown>, string][] = [
      [{ tracks: [] }, '트랙'],
      [{ tracks: basicTracks(17) }, '트랙'],
      [{ tracks: 4 }, '트랙'],
      [{ tracks: [{ id: 'bad id' }] }, '트랙'],
      [{ tracks: [{ id: 'A', color: 'red' }] }, '트랙'],
      [{ tracks: undefined }, '트랙'],
      [{ bpm: 0 }, 'BPM'],
      [{ bpm: -120 }, 'BPM'],
      [{ bpm: Number.NaN }, 'BPM'],
      [{ bpm: Number.POSITIVE_INFINITY }, 'BPM'],
      [{ bpm: '120' }, 'BPM'],
      [{ audioPath: path.join(tmp, 'x.exe') }, '음악 파일'],
      [{ audioPath: path.join(tmp, 'x.json') }, '음악 파일'],
      [{ audioPath: 'x.mp3' }, '음악 파일'],
      [{ audioPath: '' }, '음악 파일'],
      [{ audioPath: 3 }, '음악 파일'],
      [{ title: '' }, '제목'],
      [{ title: '   ' }, '제목'],
      [{ title: 1 }, '제목'],
      [{ chartName: ' ' }, '난이도'],
      [{ artist: null }, '아티스트'],
      [{ parentDir: '' }, '저장 위치'],
      [{ parentDir: 'relative/dir' }, '저장 위치']
    ]
    for (const [patch, message] of bad) {
      expect(() => validateCreateProjectOptions({ ...opts, ...patch }), JSON.stringify(patch)).toThrow(message)
    }
    expect(() => validateCreateProjectOptions(null)).toThrow()
    expect(() => validateCreateProjectOptions('x')).toThrow()
  })
  it('잘못된 옵션이면 폴더를 만들지 않음', async () => {
    await expect(createProject({ ...opts, title: 'badtracks', tracks: basicTracks(17) })).rejects.toThrow('트랙')
    expect(existsSync(path.join(tmp, 'badtracks'))).toBe(false)
  })
  it('탐색기로 열 경로는 있는 폴더여야 함', async () => {
    await expect(assertDirectory(tmp)).resolves.toBeUndefined()
    await expect(assertDirectory(mp3)).rejects.toThrow('폴더')
    await expect(assertDirectory(path.join(tmp, 'gone'))).rejects.toThrow('폴더')
    await expect(assertDirectory('relative')).rejects.toThrow('폴더')
    await expect(assertDirectory(42 as unknown as string)).rejects.toThrow('폴더')
  })
  it('실패해도 이미 있던 폴더는 남김', async () => {
    await fs.mkdir(path.join(tmp, 'keep'))
    await fs.writeFile(path.join(tmp, 'keep', 'marker'), 'm')
    await expect(createProject({ ...opts, title: 'keep', audioPath: path.join(tmp, 'none.mp3') })).rejects.toThrow()
    expect(existsSync(path.join(tmp, 'keep', 'marker'))).toBe(true)
  })
})
