import { useEffect, useRef, useState, type ReactNode } from 'react'
import styles from './Menu.module.css'

interface MenuItem {
  label: string
  onSelect: () => void
  disabled?: boolean
  danger?: boolean
}

interface MenuProps {
  trigger: ReactNode
  items: MenuItem[]
  /** 펼치는 방향. 화면 아래쪽(하단 툴바)에서는 'up' */
  placement?: 'down' | 'up'
  align?: 'left' | 'right'
}

export function Menu({ trigger, items, placement = 'down', align = 'left' }: MenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={styles.root} ref={ref}>
      <div className={styles.trigger} onClick={() => setOpen((o) => !o)}>
        {trigger}
      </div>
      {open && (
        <div
          className={`${styles.popup} ${placement === 'up' ? styles.up : ''} ${align === 'right' ? styles.right : ''}`}
          role="menu"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`${styles.item} ${item.danger ? styles.danger : ''}`}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
