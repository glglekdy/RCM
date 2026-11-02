import { Download, X } from 'lucide-react'
import { Button, IconButton } from '../ui'
import { caps } from '../ui/platform'
import { installNoticeKind, isIos, setInstallPrompt, useInstallPrompt } from '../web/pwaStore'
import styles from './HomeScreen.module.css'

export const INSTALL_NOTICE_ID = 'install-pwa'

/** 웹에서 설치 전에 홈에 보이는 안내. 안드로이드는 설치 버튼, 아이폰은 방법 안내 */
export function InstallNotice({ onClose }: { onClose: () => void }) {
  const prompt = useInstallPrompt()
  const kind = installNoticeKind({
    pc: caps().windowControls,
    standalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true,
    ios: isIos(navigator.userAgent, navigator.maxTouchPoints),
    canPrompt: prompt !== null
  })
  if (kind === null) return null
  return (
    <section className={`${styles.notice} enter-fade`}>
      <div className={styles.noticeClose}>
        <IconButton icon={X} label="공지 닫기" onClick={onClose} />
      </div>
      <h2 className={styles.noticeTitle}>
        <Download size={16} /> 앱으로 설치
      </h2>
      {kind === 'prompt' ? (
        <Button
          onClick={() => {
            const p = prompt
            setInstallPrompt(null)
            p?.prompt().catch(() => {})
          }}
        >
          앱으로 설치
        </Button>
      ) : (
        <>
          <p className={styles.noticeText}>공유 → 홈 화면에 추가</p>
          <p className={styles.noticeText}>설치하지 않으면 7일 동안 열지 않았을 때 브라우저가 프로젝트를 지울 수 있어요</p>
        </>
      )}
    </section>
  )
}
