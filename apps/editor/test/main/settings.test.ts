import { describe, it, expect, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_PRESETS, type TrackPreset } from '../../src/shared/presets'
import {
  loadSettings,
  presetsOf,
  saveSettings,
  touchRecent,
  updateSettings,
  validateLastPresetId,
  validatePresets
} from '../../src/main/project/settings'

describe('settings', () => {
  it('최근 목록', () => {
    const list = Array.from({ length: 20 }, (_, i) => ({ dir: `d${i}`, lastOpened: i }))
    const next = touchRecent(list, 'd5', 100)
    expect(next[0]).toEqual({ dir: 'd5', lastOpened: 100 })
    expect(next.filter((e) => e.dir === 'd5')).toHaveLength(1)
    expect(touchRecent(list, 'new', 100)).toHaveLength(20)
  })

  let tmp = ''
  afterEach(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true })
  })
  it('동시에 저장해도 임시 파일이 겹치지 않음', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-settings-'))
    const file = path.join(tmp, 'settings.json')
    const saves = Array.from({ length: 8 }, (_, i) =>
      saveSettings(file, { recent: [{ dir: `d${i}`, lastOpened: i }] })
    )
    await expect(Promise.all(saves)).resolves.toBeDefined()
    expect((await loadSettings(file)).recent).toHaveLength(1)
    expect((await fs.readdir(tmp)).some((f) => f.includes('.tmp-'))).toBe(false)
  })

  it('프리셋과 마지막 프리셋 id를 저장하고 다시 읽음', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-settings-'))
    const file = path.join(tmp, 'settings.json')
    const presets: TrackPreset[] = [{ id: 'p1', name: '내 4K', tracks: [{ id: 'Note_1', key: 'KeyD' }] }]
    await saveSettings(file, { recent: [], presets, lastPresetId: 'p1' })
    const loaded = await loadSettings(file)
    expect(presetsOf(loaded)).toEqual({ presets, lastPresetId: 'p1' })
  })

  it('저장된 프리셋이 없으면 기본 프리셋, 마지막 id는 null', () => {
    expect(presetsOf({ recent: [] })).toEqual({ presets: DEFAULT_PRESETS, lastPresetId: null })
  })

  it('프리셋 저장 입력 검사: 하나라도 버려지면 거부', () => {
    const ok: TrackPreset[] = [{ id: 'p1', name: 'A', tracks: [{ id: 'Note_1', key: null }] }]
    expect(validatePresets(ok)).toEqual(ok)
    const bad: unknown[] = [
      'x',
      undefined,
      null,
      [],
      [{ id: 'p1', name: '', tracks: [{ id: 'Note_1', key: null }] }],
      [...ok, { id: 'p2', name: 'B', tracks: [{ id: 'bad id', key: null }] }],
      [...ok, ...ok],
      // 모두 잘못됐으면 기본 프리셋으로 바뀌므로 개수만으로는 구별되지 않는다
      DEFAULT_PRESETS.map((p) => ({ ...p, name: '' }))
    ]
    for (const raw of bad) expect(() => validatePresets(raw), JSON.stringify(raw)).toThrow('프리셋에 잘못된 값이 있어요')
  })

  it('깨진 프리셋은 버리고, 없으면 기본 프리셋', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-settings-'))
    const file = path.join(tmp, 'settings.json')
    await fs.writeFile(file, JSON.stringify({ recent: [], presets: [{ id: 'x', name: '', tracks: [] }] }))
    expect((await loadSettings(file)).presets).toEqual(DEFAULT_PRESETS)
  })

  it('읽을 때 깨진 프리셋만 버림, 프리셋 필드가 없으면 그대로 없음', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-settings-'))
    const file = path.join(tmp, 'settings.json')
    const good: TrackPreset = { id: 'p1', name: 'A', tracks: [{ id: 'Note_1', key: 'KeyD' }] }
    await fs.writeFile(file, JSON.stringify({ recent: [], presets: [good, { id: 'p2', name: 'B' }] }))
    expect((await loadSettings(file)).presets).toEqual([good])
    await fs.writeFile(file, JSON.stringify({ recent: [] }))
    expect((await loadSettings(file)).presets).toBeUndefined()
  })

  it('동시에 고쳐도 변경이 사라지지 않음', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-settings-'))
    const file = path.join(tmp, 'settings.json')
    const presets: TrackPreset[] = [{ id: 'p1', name: 'A', tracks: [{ id: 'Note_1', key: null }] }]
    await Promise.all([
      ...Array.from({ length: 8 }, (_, i) =>
        updateSettings(file, (s) => {
          s.recent = touchRecent(s.recent, `d${i}`, i)
        })
      ),
      updateSettings(file, (s) => {
        s.presets = presets
      }),
      updateSettings(file, (s) => {
        s.lastPresetId = 'p1'
      })
    ])
    const loaded = await loadSettings(file)
    expect(loaded.recent).toHaveLength(8)
    expect(presetsOf(loaded)).toEqual({ presets, lastPresetId: 'p1' })
  })

  it('고치다 실패해도 다음 고치기는 실행됨, 최근 목록만 고쳐도 프리셋은 남음', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-settings-'))
    const file = path.join(tmp, 'settings.json')
    const presets: TrackPreset[] = [{ id: 'p1', name: 'A', tracks: [{ id: 'Note_1', key: null }] }]
    await saveSettings(file, { recent: [], presets })
    const failed = updateSettings(file, () => {
      throw new Error('boom')
    })
    const next = updateSettings(file, (s) => {
      s.recent = touchRecent(s.recent, 'd', 1)
    })
    await expect(failed).rejects.toThrow('boom')
    await next
    const raw = JSON.parse(await fs.readFile(file, 'utf8'))
    expect(raw.recent).toEqual([{ dir: 'd', lastOpened: 1 }])
    expect(raw.presets).toEqual(presets)
  })

  it('고칠 때 파일이 없으면 새로 만들고, 읽지 못하거나 깨졌으면 덮어쓰지 않고 거부', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-settings-'))
    const file = path.join(tmp, 'settings.json')
    await updateSettings(file, (s) => {
      s.lastPresetId = 'p1'
    })
    expect((await loadSettings(file)).lastPresetId).toBe('p1')

    const touchD = (s: { recent: { dir: string; lastOpened: number }[] }) => {
      s.recent = touchRecent(s.recent, 'd', 1)
    }
    for (const broken of ['{"recent": [', 'null', '[]']) {
      await fs.writeFile(file, broken)
      await expect(updateSettings(file, touchD), broken).rejects.toThrow()
      expect(await fs.readFile(file, 'utf8')).toBe(broken)
      // 그냥 읽을 때는 예전처럼 빈 설정
      expect(await loadSettings(file)).toEqual({ recent: [] })
    }

    // 읽기 오류(ENOENT가 아님): 폴더라서 읽을 수 없는 경로
    const dirAsFile = path.join(tmp, 'dir.json')
    await fs.mkdir(dirAsFile)
    await expect(updateSettings(dirAsFile, touchD)).rejects.toThrow()
    expect((await fs.stat(dirAsFile)).isDirectory()).toBe(true)
  })

  it('마지막 프리셋 id 검사', () => {
    expect(validateLastPresetId('6k-side')).toBe('6k-side')
    expect(() => validateLastPresetId(1)).toThrow()
    expect(() => validateLastPresetId('x'.repeat(65))).toThrow()
  })
})
