import type { ReactNode } from 'react'
import styles from './Button.module.css'

interface ButtonProps {
  variant?: 'primary' | 'default' | 'ghost' | 'danger'
  disabled?: boolean
  onClick?: () => void
  /** 마우스를 올리면 보이는 설명. 글자를 숨긴 아이콘 버튼에서는 이름 대신 읽힌다 */
  title?: string
  children: ReactNode
}

export function Button({ variant = 'default', disabled, onClick, title, children }: ButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.btn} ${styles[variant]}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
