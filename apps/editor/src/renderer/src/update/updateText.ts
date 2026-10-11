import type { UpdateState } from '../../../shared/api'

/** 패널에 보여 줄 상태 문구. 보여 줄 게 없으면(idle) null. */
export function updateStatusText(s: UpdateState): string | null {
  switch (s.kind) {
    case 'idle':
      return null
    case 'checking':
      return '확인 중…'
    case 'latest':
      return '최신 버전이에요'
    case 'downloading':
      return `${s.version} 받는 중 ${s.percent}%`
    case 'ready':
      return `${s.version} 준비됨`
    case 'error':
      return '확인하지 못했어요'
  }
}
