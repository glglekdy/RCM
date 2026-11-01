import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT } from '@rcm/playfield'
import { sanitizePresets } from '../../editor/src/shared/presets'
import { openRcmDb } from '../src/api/db'
import { createSettings } from '../src/api/settings'

let n = 0
const fresh = async () => {
  const db = await openRcmDb(`settings-${++n}`)
  return { db, settings: createSettings(db) }
}

describe('createSettings', () => {
  it('새 DB에서는 처음 실행이에요', async () => {
    const { settings } = await fresh()
    expect(await settings.getWhatsNewState()).toEqual({ lastSeenVersion: null, firstRun: true })
  })

  it('값을 저장한 뒤 다시 열면 처음 실행이 아니에요', async () => {
    const { db, settings } = await fresh()
    await settings.setLastSeenVersion('1.2.3')
    const again = createSettings(db)
    expect(await again.getWhatsNewState()).toEqual({ lastSeenVersion: '1.2.3', firstRun: false })
  })

  it('버전 형식이 틀리면 reject해요', async () => {
    const { settings } = await fresh()
    await expect(settings.setLastSeenVersion('abc')).rejects.toThrow('버전 값이 올바르지 않아요')
  })

  it('판정 오프셋은 -200~200 정수만 받아요', async () => {
    const { settings } = await fresh()
    expect(await settings.getJudgeOffset()).toBe(0)
    await expect(settings.setJudgeOffset(300)).rejects.toThrow()
    await expect(settings.setJudgeOffset(1.5)).rejects.toThrow()
    await settings.setJudgeOffset(-40)
    expect(await settings.getJudgeOffset()).toBe(-40)
  })

  it('자동 저장은 기본 켬이에요', async () => {
    const { settings } = await fresh()
    expect(await settings.getAutoSave()).toBe(true)
    await settings.setAutoSave(false)
    expect(await settings.getAutoSave()).toBe(false)
  })

  it('디스코드 활동은 항상 꺼져 있어요', async () => {
    const { settings } = await fresh()
    await settings.setDiscordPresence(true)
    expect(await settings.getDiscordPresence()).toBe(false)
  })

  it('프리셋 기본값은 sanitizePresets(undefined)와 같아요', async () => {
    const { settings } = await fresh()
    expect(await settings.getPresets()).toEqual({ presets: sanitizePresets(undefined), lastPresetId: null })
  })

  it('프리셋을 저장하고 마지막 id를 기억해요', async () => {
    const { settings } = await fresh()
    const { presets } = await settings.getPresets()
    await settings.savePresets(presets)
    await settings.setLastPresetId(presets[0].id)
    expect(await settings.getPresets()).toEqual({ presets, lastPresetId: presets[0].id })
    await expect(settings.savePresets([])).rejects.toThrow('프리셋에 잘못된 값이 있어요')
  })

  it('공지는 한 번만 닫고, 본 공지사항은 더해요', async () => {
    const { settings } = await fresh()
    await settings.dismissNotice('n-1')
    await settings.dismissNotice('n-1')
    expect(await settings.getDismissedNotices()).toEqual(['n-1'])
    await expect(settings.dismissNotice('Bad Id')).rejects.toThrow('공지 id가 올바르지 않아요')
    await settings.markAnnouncementsSeen(['a', 'b'])
    await settings.markAnnouncementsSeen(['b', 'c'])
    expect(await settings.getSeenAnnouncements()).toEqual(['a', 'b', 'c'])
  })

  it('테스트 플레이 배속은 범위를 지켜요', async () => {
    const { settings } = await fresh()
    expect(await settings.getPlaytestSpeed()).toBeNull()
    await settings.setPlaytestSpeed(3.5)
    expect(await settings.getPlaytestSpeed()).toBe(3.5)
    await expect(settings.setPlaytestSpeed(99)).rejects.toThrow('배속 값이 올바르지 않아요')
  })

  it('게임플레이 레이아웃 기본값과 저장', async () => {
    const { settings } = await fresh()
    expect(await settings.getGameplayLayout()).toEqual(DEFAULT_LAYOUT)
    await settings.setGameplayLayout({ ...DEFAULT_LAYOUT, laneWidth: 99999 })
    const saved = await settings.getGameplayLayout()
    expect(saved).not.toEqual({ ...DEFAULT_LAYOUT, laneWidth: 99999 })
  })
})
