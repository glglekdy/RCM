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

  it('마지막 프리셋 id 검사', () => {
    expect(validateLastPresetId('6k-side')).toBe('6k-side')
    expect(() => validateLastPresetId(1)).toThrow()
    expect(() => validateLastPresetId('x'.repeat(65))).toThrow()
  })
})
