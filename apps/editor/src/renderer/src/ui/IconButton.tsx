import type { LucideIcon } from 'lucide-react'
import styles from './IconButton.module.css'

interface IconButtonProps {
  icon: LucideIcon
  label: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}

export function IconButton({ icon: Icon, label, active, disabled, onClick }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.btn} ${active ? styles.active : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={18} />
    </button>
  )
}
