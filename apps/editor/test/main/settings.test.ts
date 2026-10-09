import { describe, it, expect, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadSettings, saveSettings, touchRecent } from '../../src/main/project/settings'

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
})
