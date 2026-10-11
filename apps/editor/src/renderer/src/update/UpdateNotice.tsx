import { useState } from 'react'
import { X } from 'lucide-react'
import { Button, IconButton } from '../ui'
import { useUpdateState } from './updateStore'
import styles from './UpdateNotice.module.css'

/** 새 버전이 준비되면 하단에 띄우는 알림. 닫으면 같은 버전은 이번 실행 동안 다시 띄우지 않는다. */
export function UpdateNotice() {
  const state = useUpdateState()
  const [dismissed, setDismissed] = useState<string | null>(null)

  if (state.kind !== 'ready' || state.version === dismissed) return null
  const { version } = state

  return (
    <div className={styles.notice} role="status">
      <span>새 버전 {version} 준비됨 · 설치 후 자동으로 다시 열려요</span>
      <Button variant="primary" onClick={() => window.rcm.installUpdate()}>
        지금 재시작
      </Button>
      <IconButton icon={X} label="닫기" onClick={() => setDismissed(version)} />
    </div>
  )
}
