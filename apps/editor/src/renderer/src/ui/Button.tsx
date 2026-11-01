import type { PointerEvent, MouseEvent, ReactNode } from 'react'
import styles from './Button.module.css'

interface ButtonProps {
  variant?: 'primary' | 'default' | 'ghost' | 'danger'
  disabled?: boolean
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  /** 박자처럼 누른 순간이 중요한 버튼에서 쓴다 */
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>) => void
  className?: string
  /** 마우스를 올리면 보이는 설명. 글자를 숨긴 아이콘 버튼에서는 이름 대신 읽힌다 */
  title?: string
  children: ReactNode
}

export function Button({ variant = 'default', disabled, onClick, onPointerDown, className, title, children }: ButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.btn} ${styles[variant]}${className ? ` ${className}` : ''}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      {children}
    </button>
  )
}
