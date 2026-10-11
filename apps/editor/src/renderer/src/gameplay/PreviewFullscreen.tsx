import { useEffect } from 'react'
import { X } from 'lucide-react'
import { IconButton } from '../ui'
import { LayoutPreview } from './LayoutPreview'
import { useLayout } from './layoutStore'
import styles from './LayoutPreview.module.css'

/** 앱 창 전체를 덮는 미리보기 (테스트 플레이와 같은 크기). Esc로 닫는다. */
export function PreviewFullscreen({ onClose }: { onClose: () => void }) {
  const layout = useLayout()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className={styles.fullscreen} role="dialog" aria-label="미리보기 전체화면">
      <LayoutPreview layout={layout} className={styles.canvas} />
      <div className={styles.close}>
        <IconButton icon={X} label="닫기 (Esc)" onClick={onClose} />
      </div>
    </div>
  )
}
