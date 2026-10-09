import type { ReactNode } from 'react'
import styles from './Button.module.css'

interface ButtonProps {
  variant?: 'primary' | 'default' | 'ghost' | 'danger'
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
}

export function Button({ variant = 'default', disabled, onClick, children }: ButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.btn} ${styles[variant]}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
