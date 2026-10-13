/** `X.Y.Z` 버전을 숫자로 비교한다 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1
  }
  return 0
}

export interface SeenState {
  /** 업데이트 내역을 마지막으로 확인한 버전. 이 기능 전 버전에서 올라왔으면 null */
  lastSeenVersion: string | null
  /** 설정 파일이 없었음 = 처음 설치 */
  firstRun: boolean
}

/**
 * 시작할 때 보여 줄 업데이트 내역 버전들 (최신부터). 처음 설치면 없음, 기록이 없는 예전 사용자는 지금 버전만,
 * 그 밖에는 마지막으로 본 버전 다음부터 지금 버전까지 (건너뛴 버전 포함).
 */
export function whatsNewVersions(available: readonly string[], current: string, seen: SeenState): string[] {
  if (seen.firstRun) return []
  const { lastSeenVersion } = seen
  const shown =
    lastSeenVersion === null
      ? available.filter((v) => v === current)
      : available.filter((v) => compareVersions(v, lastSeenVersion) > 0 && compareVersions(v, current) <= 0)
  return shown.sort((a, b) => compareVersions(b, a))
}

/** 지금 버전 이하에서 가장 최신 내역 (사이드바에서 다시 볼 때). 없으면 null */
export function latestNotesVersion(available: readonly string[], current: string): string | null {
  const older = available.filter((v) => compareVersions(v, current) <= 0).sort((a, b) => compareVersions(b, a))
  return older[0] ?? null
}
