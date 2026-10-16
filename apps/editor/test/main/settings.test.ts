import { describe, it, expect, afterEach, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_LAYOUT } from '@rcm/playfield'
import { DEFAULT_PRESETS, type TrackPreset } from '../../src/shared/presets'
import {
  loadSettings,
  presetsOf,
  saveSettings,
  touchRecent,
  updateSettings,
  validateLastPresetId,
  validateLastSeenVersion,
  validateNoticeId,
  validatePlaytestSpeed,
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

  it('playtestSpeed: 1~9 사이 숫자만 읽음', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-settings-'))
    const file = path.join(tmp, 'settings.json')
    for (const [raw, expected] of [
      [4.5, 4.5],
      [1, 1],
      [9, 9],
      [0.5, undefined],
      [9.1, undefined],
      ['4', undefined],
      [null, undefined]
    ] as const) {
      await fs.writeFile(file, JSON.stringify({ recent: [], playtestSpeed: raw }))
      expect((await loadSettings(file)).playtestSpeed, String(raw)).toBe(expected)
    }
  })

  it('gameplay: 깨진 값은 정리하고 다른 설정은 유지', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-settings-'))
    const file = path.join(tmp, 'settings.json')
    await fs.writeFile(
      file,
      JSON.stringify({ recent: [{ dir: 'd', lastOpened: 1 }], gameplay: { laneWidth: 999, noteShape: 'x' } })
    )
    const loaded = await loadSettings(file)
    expect(loaded.gameplay).toEqual({ ...DEFAULT_LAYOUT, laneWidth: 200 })
    expect(loaded.recent).toEqual([{ dir: 'd', lastOpened: 1 }])
    await fs.writeFile(file, JSON.stringify({ recent: [] }))
    expect((await loadSettings(file)).gameplay).toBeUndefined()
  })

  it('lastSeenVersion: X.Y.Z 형식만 읽음', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-settings-'))
    const file = path.join(tmp, 'settings.json')
    for (const [raw, expected] of [
      ['0.5.2', '0.5.2'],
      ['v0.5.2', undefined],
      [5, undefined]
    ] as const) {
      await fs.writeFile(file, JSON.stringify({ recent: [], lastSeenVersion: raw }))
      expect((await loadSettings(file)).lastSeenVersion, String(raw)).toBe(expected)
    }
  })

  it('lastSeenVersion 저장 입력 검사', () => {
    expect(validateLastSeenVersion('10.0.1')).toBe('10.0.1')
    for (const bad of ['1.2', '0.5.2-beta', '', null, 1]) {
      expect(() => validateLastSeenVersion(bad), String(bad)).toThrow('버전 값이 올바르지 않아요')
    }
  })

  it('dismissedNotices: 형식이 맞는 id만 읽음', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-settings-'))
    const file = path.join(tmp, 'settings.json')
    await fs.writeFile(file, JSON.stringify({ recent: [], dismissedNotices: ['made-with-rcm', 'Bad Id', 3] }))
    expect((await loadSettings(file)).dismissedNotices).toEqual(['made-with-rcm'])
    await fs.writeFile(file, JSON.stringify({ recent: [], dismissedNotices: 'made-with-rcm' }))
    expect((await loadSettings(file)).dismissedNotices).toBeUndefined()
  })

  it('공지 id 저장 입력 검사', () => {
    expect(validateNoticeId('made-with-rcm')).toBe('made-with-rcm')
    for (const bad of ['', 'Made With RCM', 'a'.repeat(65), null, 1]) {
      expect(() => validateNoticeId(bad), String(bad)).toThrow('공지 id가 올바르지 않아요')
    }
  })

  it('playtestSpeed 저장 입력 검사', () => {
    expect(validatePlaytestSpeed(4.3)).toBe(4.3)
    for (const bad of [0, 10, NaN, '4', undefined]) {
      expect(() => validatePlaytestSpeed(bad), String(bad)).toThrow('배속 값이 올바르지 않아요')
    }
  })

  it('discordPresence: boolean만 읽고, 고쳐 저장해도 다른 설정은 남음', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-settings-'))
    const file = path.join(tmp, 'settings.json')
    await fs.writeFile(file, JSON.stringify({ recent: [], discordPresence: 'no' }))
    expect((await loadSettings(file)).discordPresence).toBeUndefined()

    const presets: TrackPreset[] = [{ id: 'p1', name: '내 4K', tracks: [{ id: 'Note_1', key: 'KeyD' }] }]
    await saveSettings(file, { recent: [{ dir: 'd', lastOpened: 1 }], presets })
    await updateSettings(file, (s) => {
      s.discordPresence = false
    })
    const loaded = await loadSettings(file)
    expect(loaded.discordPresence).toBe(false)
    expect(loaded.recent).toEqual([{ dir: 'd', lastOpened: 1 }])
    expect(loaded.presets).toEqual(presets)
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

  const touchD = (s: { recent: { dir: string; lastOpened: number }[] }) => {
    s.recent = touchRecent(s.recent, 'd', 1)
  }

  it('고칠 때 파일이 없으면 새로 만듦', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-settings-'))
    const file = path.join(tmp, 'settings.json')
    await updateSettings(file, (s) => {
      s.lastPresetId = 'p1'
    })
    expect((await loadSettings(file)).lastPresetId).toBe('p1')
  })

  it('고칠 때 내용이 깨졌으면 broken 파일로 옮겨 두고 빈 설정에서 새로 저장', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      for (const broken of ['{"recent": [', 'null', '[]']) {
        tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-settings-'))
        const file = path.join(tmp, 'settings.json')
        await fs.writeFile(file, broken)
        // 그냥 읽을 때는 예전처럼 빈 설정
        expect(await loadSettings(file)).toEqual({ recent: [] })
        await updateSettings(file, touchD)
        const names = await fs.readdir(tmp)
        const moved = names.filter((n) => /^settings\.json\.broken-\d+$/.test(n))
        expect(moved, broken).toHaveLength(1)
        expect(await fs.readFile(path.join(tmp, moved[0]), 'utf8')).toBe(broken)
        expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual({ recent: [{ dir: 'd', lastOpened: 1 }] })
        await fs.rm(tmp, { recursive: true, force: true })
      }
      expect(logged).toHaveBeenCalledTimes(3)
    } finally {
      logged.mockRestore()
    }
  })

  it('고칠 때 읽기 오류(ENOENT가 아님)면 아무것도 쓰지 않고 거부', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-settings-'))
    // 폴더라서 읽을 수 없는 경로 (EISDIR)
    const dirAsFile = path.join(tmp, 'settings.json')
    await fs.mkdir(dirAsFile)
    await expect(updateSettings(dirAsFile, touchD)).rejects.toThrow()
    expect((await fs.stat(dirAsFile)).isDirectory()).toBe(true)
    expect(await fs.readdir(tmp)).toEqual(['settings.json'])
    expect(await fs.readdir(dirAsFile)).toEqual([])
  })

  it('마지막 프리셋 id 검사', () => {
    expect(validateLastPresetId('6k-side')).toBe('6k-side')
    expect(() => validateLastPresetId(1)).toThrow()
    expect(() => validateLastPresetId('x'.repeat(65))).toThrow()
  })
})
