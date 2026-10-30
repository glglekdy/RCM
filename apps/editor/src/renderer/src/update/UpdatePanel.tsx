import { useEffect, useState } from 'react'
import { RefreshCw, RotateCw } from 'lucide-react'
import { Button, IconButton } from '../ui'
import { hasNotesFor, openWhatsNew } from '../whatsNew/whatsNewStore'
import { useUpdateState } from './updateStore'
import { updateButtonAction, updateStatusText } from './updateText'
import styles from './UpdatePanel.module.css'

interface UpdatePanelProps {
  /** 접은 사이드바: 버전 글자 없이 아이콘 버튼 하나만. 상태 글은 마우스를 올리면 보인다 */
  compact?: boolean
}

export function UpdatePanel({ compact }: UpdatePanelProps) {
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
  const restart = updateButtonAction(state) === 'restart'

  if (compact) {
    return (
      <div className={`${styles.panel} ${restart ? styles.restart : ''}`}>
        {restart ? (
          <IconButton icon={RotateCw} label="재시작해서 업데이트" onClick={() => window.rcm.installUpdate()} />
        ) : (
          <IconButton
            icon={RefreshCw}
            label={[version && `v${version}`, text || '업데이트 확인'].filter(Boolean).join(' · ')}
            disabled={!packaged || busy}
            onClick={() => {
              window.rcm.checkForUpdates().catch(() => {})
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.versionRow}>
        <div className={styles.version}>
          {version && `v${version}`}
          {packaged === false && ' (개발 모드 · 업데이트 꺼짐)'}
        </div>
        {version && hasNotesFor(version) && (
          <button type="button" className={styles.notesLink} onClick={() => openWhatsNew(version)}>
            업데이트 내역
          </button>
        )}
      </div>
      {restart ? (
        <Button variant="primary" onClick={() => window.rcm.installUpdate()}>
          <RotateCw size={14} /> 재시작해서 업데이트
        </Button>
      ) : (
        <Button
          disabled={!packaged || busy}
          onClick={() => {
            window.rcm.checkForUpdates().catch(() => {})
          }}
        >
          업데이트 확인
        </Button>
      )}
      {text && (
        <div className={styles.status} title={state.kind === 'error' ? state.message : undefined}>
          {text}
        </div>
      )}
    </div>
  )
}
