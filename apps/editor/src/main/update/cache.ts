import { promises as fs } from 'node:fs'
import { join } from 'node:path'

const INSTALLER_RE = /^RCM-Setup-(\d+\.\d+\.\d+)\.exe$/

/** `RCM-Setup-X.Y.Z.exe` → `'X.Y.Z'`, 설치 파일이 아니면 null. */
export function installerVersion(fileName: string): string | null {
  return INSTALLER_RE.exec(fileName)?.[1] ?? null
}

// scripts/version.mjs의 compareVersions와 같은 규칙 (main 번들은 루트 scripts를 가져오지 않는다).
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1
    if (pa[i] < pb[i]) return -1
  }
  return 0
}

/**
 * 지울 설치 파일: 이미 설치된 버전 이하이거나, 남길 버전(keepVersion)이 있을 때 그와 다른 버전.
 * 설치 파일이 아닌 파일(`update-info.json` 등)은 건드리지 않는다.
 */
export function pendingToDelete(files: string[], keepVersion: string | null, appVersion: string): string[] {
  return files.filter((file) => {
    const version = installerVersion(file)
    if (version === null) return false
    if (compareVersions(version, appVersion) <= 0) return true
    return keepVersion !== null && version !== keepVersion
  })
}

/** 업데이트 캐시의 pending 폴더에서 필요 없는 설치 파일을 지운다. 폴더가 없으면 아무것도 안 하고, 지우기 실패는 로그만 남긴다. */
export async function cleanPendingInstallers(
  dir: string,
  keepVersion: string | null,
  appVersion: string
): Promise<void> {
  let files: string[]
  try {
    files = await fs.readdir(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('업데이트 캐시 폴더를 읽지 못했어요', err)
    }
    return
  }
  for (const file of pendingToDelete(files, keepVersion, appVersion)) {
    try {
      await fs.rm(join(dir, file), { force: true })
    } catch (err) {
      console.error('지난 업데이트 설치 파일을 지우지 못했어요', err)
    }
  }
}
