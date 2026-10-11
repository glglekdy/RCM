import { ipcMain } from 'electron'
import { isPresenceInfo } from '../../shared/presence'
import { loadSettings, updateSettings } from '../project/settings'
import { DISCORD_CLIENT_ID } from './config'
import { connectDiscord } from './connection'
import { createDiscordPresence } from './presence'

/** 디스코드 활동 표시 서비스와 IPC를 시작한다. 돌려주는 함수로 정리한다 (앱 종료 때). */
export function startDiscordPresence(settingsFile: string): () => void {
  const service = DISCORD_CLIENT_ID
    ? createDiscordPresence({ connect: () => connectDiscord(DISCORD_CLIENT_ID), appStartedAt: Date.now() })
    : null

  void loadSettings(settingsFile).then((s) => service?.setEnabled(s.discordPresence ?? true))

  ipcMain.on('rcm:set-presence', (_e, raw: unknown) => {
    // 형식이 틀린 값은 무시하고 지금 상태를 유지한다
    if (raw === null || isPresenceInfo(raw)) service?.setInfo(raw)
  })

  ipcMain.handle(
    'rcm:get-discord-presence',
    async () => (await loadSettings(settingsFile)).discordPresence ?? true
  )

  ipcMain.handle('rcm:set-discord-presence', async (_e, raw: unknown) => {
    if (typeof raw !== 'boolean') throw new Error('설정 값이 올바르지 않아요')
    await updateSettings(settingsFile, (settings) => {
      settings.discordPresence = raw
    })
    service?.setEnabled(raw)
  })

  return () => service?.dispose()
}
