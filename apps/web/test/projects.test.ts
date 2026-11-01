import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { openRcmDb } from '../src/api/db'
import { registerPicked } from '../src/api/picked'
import { createProjects, type ProjectDeps } from '../src/api/projects'

/** Map 기반 가짜 `navigator.locks`. 같은 Map을 나눠 쓰면 "다른 탭"이 된다 */
function fakeLocks(held: Set<string> = new Set()): ProjectDeps['locks'] {
  return {
    async request(name, _opts, cb) {
      if (held.has(name)) {
        await cb(null)
        return
      }
      held.add(name)
      try {
        await cb({ name })
      } finally {
        held.delete(name)
      }
    }
  }
}

let n = 0
const setup = async (held: Set<string> = new Set()) => {
  const db = await openRcmDb(`projects-${++n}`)
  let t = 1000
  let u = 0
  const deps = { locks: fakeLocks(held), now: () => ++t, uuid: () => `id${++u}` }
  return { db, held, deps, projects: createProjects(db, deps) }
}

const AUDIO = new Uint8Array([1, 2, 3, 4, 5])
const audioFile = (name = '봄날.mp3') => new File([AUDIO], name, { type: 'audio/mpeg' })

const newOpts = (audioPath: string | null) => ({
  parentDir: '',
  title: '봄날',
  artist: '가수',
  audioPath,
  bpm: 120,
  chartName: 'Hard',
  tracks: [{ id: 'a' }, { id: 'b' }]
})

describe('createProjects', () => {
  it('만들기 → 열기: 채보와 복사한 음악이 그대로 있어요', async () => {
    const { projects } = await setup()
    const { dir } = await projects.createProject(newOpts(registerPicked(audioFile())))
    expect(dir).toBe('web:id1')
    const files = await projects.openProject(dir)
    expect(files.charts[0].file).toBe('hard.chart.json')
    expect(JSON.parse(files.songText).audio).toBe('봄날 (RCM).mp3')
    expect(files.editorText).not.toBeNull()
    const bytes = new Uint8Array(await projects.readAudio('web:id1/봄날 (RCM).mp3'))
    expect([...bytes]).toEqual([...AUDIO])
  })

  it('고른 파일은 readAudio로도 읽어요', async () => {
    const { projects } = await setup()
    const bytes = new Uint8Array(await projects.readAudio(registerPicked(audioFile())))
    expect([...bytes]).toEqual([...AUDIO])
  })

  it('저장은 원자적이다: 허용되지 않는 이름이 섞이면 아무것도 바뀌지 않아요', async () => {
    const { projects } = await setup()
    const { dir } = await projects.createProject(newOpts(null))
    const before = await projects.openProject(dir)
    await expect(
      projects.writeProjectFiles(dir, [
        { name: 'song.json', text: '{"changed":true}' },
        { name: '../x.json', text: '{}' }
      ])
    ).rejects.toThrow('허용되지 않는 파일 이름이에요: ../x.json')
    const after = await projects.openProject(dir)
    expect(after.songText).toBe(before.songText)
  })

  it('텍스트가 아닌 파일 내용은 거부하고 아무것도 쓰지 않아요', async () => {
    const { projects } = await setup()
    const { dir } = await projects.createProject(newOpts(null))
    const before = await projects.openProject(dir)
    await expect(
      projects.writeProjectFiles(dir, [
        { name: 'song.json', text: '{"changed":true}' },
        { name: 'x.chart.json', text: 42 as unknown as string }
      ])
    ).rejects.toThrow('파일 내용이 올바르지 않아요: x.chart.json')
    const after = await projects.openProject(dir)
    expect(after.songText).toBe(before.songText)
    expect(after.charts.map((c) => c.file)).toEqual(before.charts.map((c) => c.file))
  })

  it('저장 중 실패하면(없는 프로젝트) 아무것도 쓰지 않아요', async () => {
    const { projects } = await setup()
    await expect(projects.writeProjectFiles('web:nope', [{ name: 'song.json', text: '{}' }])).rejects.toThrow(
      '프로젝트를 찾을 수 없어요'
    )
    await expect(projects.writeProjectFiles('C:\\x', [])).rejects.toThrow('프로젝트 경로가 올바르지 않아요')
  })

  it('대소문자만 다른 이름은 같은 파일로 덮어쓴다', async () => {
    const { projects } = await setup()
    const { dir } = await projects.createProject(newOpts(null))
    const first = await projects.openProject(dir)
    await projects.writeProjectFiles(dir, [{ name: 'Hard.chart.json', text: first.charts[0].text }])
    const again = await projects.openProject(dir)
    expect(again.charts.map((c) => c.file)).toEqual(['Hard.chart.json'])
  })

  it('채보 파일을 지워요 (채보 이름만)', async () => {
    const { projects } = await setup()
    const { dir } = await projects.createProject(newOpts(null))
    const first = await projects.openProject(dir)
    await projects.writeProjectFiles(dir, [{ name: 'easy.chart.json', text: first.charts[0].text }])
    await expect(projects.deleteProjectFiles(dir, ['song.json'])).rejects.toThrow('허용되지 않는 파일 이름이에요')
    await projects.deleteProjectFiles(dir, ['hard.chart.json'])
    expect((await projects.openProject(dir)).charts.map((c) => c.file)).toEqual(['easy.chart.json'])
  })

  it('만들기 중 쓰기가 실패하면 프로젝트가 남지 않는다', async () => {
    const { projects } = await setup()
    await expect(projects.createProject(newOpts('picked:never-registered'))).rejects.toThrow(
      '파일을 다시 골라 주세요'
    )
    expect(await projects.getRecentProjects()).toEqual([])
  })

  it('음악이 아닌 파일은 거부하고 아무것도 만들지 않아요', async () => {
    const { projects } = await setup()
    await expect(projects.createProject(newOpts(registerPicked(new File(['x'], 'a.txt'))))).rejects.toThrow(
      '음악 파일은 ogg, mp3, wav만 쓸 수 있어요'
    )
    expect(await projects.getRecentProjects()).toEqual([])
  })

  it('목록에서 제거는 아무것도 지우지 않아요 (삭제는 trashProjects만)', async () => {
    const { projects } = await setup()
    const { dir } = await projects.createProject(newOpts(registerPicked(audioFile())))
    const before = await projects.openProject(dir)
    await projects.closeProject(dir)
    await projects.removeRecentProject(dir)
    const recent = await projects.getRecentProjects()
    expect(recent.map((p) => p.dir)).toEqual([dir])
    const after = await projects.openProject(dir)
    expect(after.songText).toBe(before.songText)
    expect(after.charts).toEqual(before.charts)
    expect(new Uint8Array(await projects.readAudio(`${dir}/봄날 (RCM).mp3`)).length).toBe(AUDIO.length)
    // 형식이 틀린 dir은 PC처럼 거절한다
    await expect(projects.removeRecentProject('C:\\x')).rejects.toThrow('프로젝트 경로가 올바르지 않아요')
  })

  it('다른 탭 잠금: 열 수 없고 삭제도 못 해요', async () => {
    const held = new Set<string>()
    const tabA = await setup(held)
    const { dir } = await tabA.projects.createProject(newOpts(null))
    await tabA.projects.openProject(dir)
    expect(held.has('rcm-project:id1')).toBe(true)
    // 같은 DB를 쓰는 다른 탭
    const tabB = createProjects(tabA.db, { ...tabA.deps, locks: fakeLocks(held) })
    await expect(tabB.openProject(dir)).rejects.toThrow('다른 탭에서 열려 있어요')
    expect(await tabB.trashProjects([dir])).toEqual([{ dir, error: '다른 탭에서 열려 있어요' }])
    // A가 닫으면 B가 열 수 있다
    await tabA.projects.closeProject(dir)
    expect(held.size).toBe(0)
    await tabB.openProject(dir)
    expect(held.has('rcm-project:id1')).toBe(true)
  })

  it('같은 탭에서 다시 열어도 잠금은 하나, 모두 닫아야 풀려요', async () => {
    const { projects, held } = await setup()
    const { dir } = await projects.createProject(newOpts(null))
    await projects.openProject(dir)
    await projects.openProject(dir)
    await projects.closeProject(dir)
    expect(held.size).toBe(1)
    await projects.closeProject(dir)
    expect(held.size).toBe(0)
    await projects.closeProject(dir) // 아무 일도 없다
    expect(held.size).toBe(0)
  })

  it('열기에 실패하면 잠금을 풀어요', async () => {
    const { projects, held, db } = await setup()
    await expect(projects.openProject('web:ghost')).rejects.toThrow('프로젝트를 찾을 수 없어요')
    expect(held.size).toBe(0)
    // song.json이 없는 프로젝트
    const tx = db.transaction('projects', 'readwrite')
    tx.objectStore('projects').put({ id: 'bare', createdAt: 1, lastOpened: 1 })
    await new Promise((r) => (tx.oncomplete = r))
    await expect(projects.openProject('web:bare')).rejects.toThrow('song.json을 찾을 수 없어요')
    expect(held.size).toBe(0)
  })

  it('열 때 쓰지 않는 복사 음악을 지운다', async () => {
    const { projects } = await setup()
    const { dir } = await projects.createProject(newOpts(registerPicked(audioFile())))
    const second = await projects.importProjectAudio(dir, registerPicked(audioFile('다른 곡.ogg')))
    expect(second).toBe('다른 곡 (RCM).ogg')
    expect(await projects.readAudio(`${dir}/${second}`)).toBeInstanceOf(ArrayBuffer)
    await projects.openProject(dir)
    await expect(projects.readAudio(`${dir}/${second}`)).rejects.toThrow('음악 파일을 찾을 수 없어요')
    expect((await projects.readAudio(`${dir}/봄날 (RCM).mp3`)).byteLength).toBe(AUDIO.length)
  })

  it('같은 음악을 또 가져오면 번호를 붙여요', async () => {
    const { projects } = await setup()
    const { dir } = await projects.createProject(newOpts(null))
    const a = await projects.importProjectAudio(dir, registerPicked(audioFile('x.wav')))
    const b = await projects.importProjectAudio(dir, registerPicked(audioFile('x.wav')))
    expect([a, b]).toEqual(['x (RCM).wav', 'x (2) (RCM).wav'])
  })

  it('최근 목록 정렬: 열람 순서대로 lastOpened 내림차순', async () => {
    const { projects } = await setup()
    const a = await projects.createProject({ ...newOpts(null), title: 'A' })
    const b = await projects.createProject({ ...newOpts(null), title: 'B' })
    await projects.openProject(a.dir)
    let list = await projects.getRecentProjects()
    expect(list.map((p) => p.title)).toEqual(['A', 'B'])
    await projects.openProject(b.dir)
    list = await projects.getRecentProjects()
    expect(list.map((p) => p.title)).toEqual(['B', 'A'])
    expect(list[0]).toMatchObject({ missing: false, artist: '가수', charts: [{ name: 'Hard', trackCount: 2 }] })
  })

  it('trashProjects는 영구 삭제한다 (파일까지)', async () => {
    const { projects } = await setup()
    const { dir } = await projects.createProject(newOpts(registerPicked(audioFile())))
    expect(await projects.trashProjects([dir])).toEqual([])
    expect(await projects.getRecentProjects()).toEqual([])
    await expect(projects.openProject(dir)).rejects.toThrow('프로젝트를 찾을 수 없어요')
    await expect(projects.readAudio(`${dir}/봄날 (RCM).mp3`)).rejects.toThrow('음악 파일을 찾을 수 없어요')
  })

  it('addImported와 listFiles: 글과 음악을 한 번에 넣고 꺼내요', async () => {
    const { projects } = await setup()
    const { dir } = await projects.addImported([
      { name: 'song.json', data: '{"a":1}' },
      { name: 'x.mp3', data: new Blob([AUDIO]) }
    ])
    const files = await projects.listFiles(dir)
    expect(files.map((f) => f.name).sort()).toEqual(['song.json', 'x.mp3'])
    expect(files.find((f) => f.name === 'song.json')?.data).toBe('{"a":1}')
    expect(files.find((f) => f.name === 'x.mp3')?.data).toBeInstanceOf(Blob)
    await expect(projects.addImported([{ name: 'evil.exe', data: 'x' }])).rejects.toThrow(
      '허용되지 않는 파일 이름이에요: evil.exe'
    )
  })
})
