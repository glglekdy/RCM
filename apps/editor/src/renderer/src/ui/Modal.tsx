import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './Modal.module.css'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** 넓은 창 (템플릿 고르기 등) */
  wide?: boolean
  /** 창 폭 (px). `wide`보다 우선 */
  width?: number
}

export function Modal({ open, title, onClose, children, footer, wide = false, width }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 이 Esc는 창을 닫는 데 썼다: window의 편집기 단축키(정지·테스트 플레이 종료)까지 가지 않게 한다
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  // body에 그린다: 등장 애니메이션 중인 페이지(transform) 안에 있어도 화면 전체를 덮도록
  return createPortal(
    <div className={`${styles.overlay} enter-fade`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`${styles.box} ${wide ? styles.wide : ''} enter-pop`}
        style={width !== undefined ? { width } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
