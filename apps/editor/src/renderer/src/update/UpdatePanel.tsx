import { useEffect, useState } from 'react'
import { Button } from '../ui'
import { useUpdateState } from './updateStore'
import { updateStatusText } from './updateText'
import styles from './UpdatePanel.module.css'

export function UpdatePanel() {
  const state = useUpdateState()
  const [version, setVersion] = useState('')
  const [packaged, setPackaged] = useState<boolean | null>(null)

  useEffect(() => {
    window.rcm
      .getAppVersion()
      .then(setVersion)
      .catch(() => {})
    window.rcm
      .isPackaged()
      .then(setPackaged)
      .catch(() => {})
  }, [])

  const busy = state.kind === 'checking' || state.kind === 'downloading'
  const text = updateStatusText(state)

  return (
    <div className={styles.panel}>
      <div className={styles.version}>
        {version && `v${version}`}
        {packaged === false && ' (개발 모드 · 업데이트 꺼짐)'}
      </div>
      <Button
        disabled={!packaged || busy}
        onClick={() => {
          window.rcm.checkForUpdates().catch(() => {})
        }}
      >
        업데이트 확인
      </Button>
      {text && (
        <div className={styles.status} title={state.kind === 'error' ? state.message : undefined}>
          {text}
        </div>
      )}
    </div>
  )
}
