import { afterEach, describe, expect, it } from 'vitest'
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
    const files = ['RCM-Setup-0.1.0.exe', 'RCM-Setup-0.1.1.exe', 'RCM-Setup-0.1.2.exe', 'update-info.json']
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
    for (const name of ['RCM-Setup-0.1.0.exe', 'RCM-Setup-0.1.2.exe', 'update-info.json']) {
      await fs.writeFile(path.join(tmp, name), 'x')
    }
    await cleanPendingInstallers(tmp, null, '0.1.1')
    expect((await fs.readdir(tmp)).sort()).toEqual(['RCM-Setup-0.1.2.exe', 'update-info.json'])
  })
})
