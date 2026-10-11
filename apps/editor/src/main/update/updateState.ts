export type UpdateState =
  | { kind: 'idle' } // 확인 전 또는 개발 모드
  | { kind: 'checking' }
  | { kind: 'latest'; version: string } // 지금이 최신
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string } // 받아 둠, 재시작 대기
  | { kind: 'error'; message: string }

export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'not-available'; version: string }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }

/** updater 이벤트를 상태에 반영한다. 받아 둔 업데이트(ready)는 이후 확인·오류로 잃지 않는다. */
export function nextState(s: UpdateState, e: UpdaterEvent): UpdateState {
  if (s.kind === 'ready' && (e.type === 'checking' || e.type === 'error' || e.type === 'not-available')) {
    return s
  }
  switch (e.type) {
    case 'checking':
      return { kind: 'checking' }
    case 'available':
      return { kind: 'downloading', version: e.version, percent: 0 }
    case 'progress':
      return s.kind === 'downloading' ? { ...s, percent: Math.floor(e.percent) } : s
    case 'not-available':
      return { kind: 'latest', version: e.version }
    case 'downloaded':
      return { kind: 'ready', version: e.version }
    case 'error':
      return { kind: 'error', message: e.message }
  }
}

/** 확인 중·받는 중·준비됨이면 새로 확인하지 않는다 (중복 확인·다운로드 방지). */
export function shouldCheck(s: UpdateState): boolean {
  return s.kind !== 'checking' && s.kind !== 'downloading' && s.kind !== 'ready'
}

/** 모든 창이 닫힌 뒤: 설치를 요청했고 받아 둔 업데이트가 있으면 설치, 아니면 종료. */
export function afterAllClosed(installRequested: boolean, updateReady: boolean): 'install' | 'quit' {
  return installRequested && updateReady ? 'install' : 'quit'
}
