import { afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cleanPendingInstallers, installerVersion, pendingToDelete } from '../../../src/main/update/cache'

describe('업데이트 캐시 정리', () => {
  it('설치 파일 버전', () => {
    expect(installerVersion('RCM-Setup-0.1.10.exe')).toBe('0.1.10')
    expect(installerVersion('update-info.json')).toBeNull()
    expect(installerVersion('RCM-Setup-0.1.exe')).toBeNull()
  })

  it('정리 대상: 설치 끝난 것과 다른 버전', () => {
    const files = [
      'RCM-Setup-0.1.0.exe',
      'RCM-Setup-0.1.1.exe',
      'RCM-Setup-0.1.2.exe',
      'update-info.json',
      'temp-RCM-Setup-0.1.0.exe',
      'RCM-Setup-0.1.0.exe.blockmap',
    ]
    expect(pendingToDelete(files, null, '0.1.1').sort()).toEqual(['RCM-Setup-0.1.0.exe', 'RCM-Setup-0.1.1.exe'])
    expect(pendingToDelete(files, '0.1.2', '0.1.0').sort()).toEqual(['RCM-Setup-0.1.0.exe', 'RCM-Setup-0.1.1.exe'])
    expect(pendingToDelete(['RCM-Setup-0.1.10.exe'], null, '0.1.9')).toEqual([])
  })

  let tmp = ''
  afterEach(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true })
  })

  it('정리 실행: 없는 폴더는 그냥 통과, 대상만 지움', async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rcm-pending-'))
    await expect(cleanPendingInstallers(path.join(tmp, 'none'), null, '0.1.0')).resolves.toBeUndefined()
    for (const name of [
      'RCM-Setup-0.1.2.exe',
      'update-info.json',
      'temp-RCM-Setup-0.1.0.exe',
      'RCM-Setup-0.1.0.exe.blockmap',
    ]) {
      await fs.writeFile(path.join(tmp, name), 'x')
    }
    // 이름이 설치 파일처럼 생긴 폴더는 지워지지 않고 남는다 (지우기 실패는 로그만)
    await fs.mkdir(path.join(tmp, 'RCM-Setup-0.1.0.exe'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await cleanPendingInstallers(tmp, null, '0.1.1')
    } finally {
      errorLog.mockRestore()
    }
    expect((await fs.readdir(tmp)).sort()).toEqual([
      'RCM-Setup-0.1.0.exe',
      'RCM-Setup-0.1.0.exe.blockmap',
      'RCM-Setup-0.1.2.exe',
      'temp-RCM-Setup-0.1.0.exe',
      'update-info.json',
    ])
  })
})
