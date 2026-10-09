import type { ReactNode } from 'react'
import styles from './Row.module.css'

interface RowProps {
  label: string
  children: ReactNode
}

export function Row({ label, children }: RowProps) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <div className={styles.value}>{children}</div>
    </div>
  )
}
