import { Minus, Square, X } from 'lucide-react'
import styles from './TitleBar.module.css'

interface TitleBarProps {
  title: string
  dirty?: boolean
}

export function TitleBar({ title, dirty }: TitleBarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.title}>
        {title}
        {dirty ? ' *' : ''}
      </div>
      <div className={styles.controls}>
        <button className={styles.btn} aria-label="최소화" onClick={() => window.rcm.minimize()}>
          <Minus size={16} />
        </button>
        <button className={styles.btn} aria-label="최대화" onClick={() => window.rcm.toggleMaximize()}>
          <Square size={14} />
        </button>
        <button
          className={`${styles.btn} ${styles.close}`}
          aria-label="닫기"
          onClick={() => window.rcm.close()}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
