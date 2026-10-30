import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import styles from './Menu.module.css'

interface MenuItem {
  label: string
  onSelect: () => void
  disabled?: boolean
  danger?: boolean
  /** 고르는 메뉴(정렬 등)에서 지금 고른 항목. 정하면 앞에 체크 칸이 생긴다 */
  checked?: boolean
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
      if (e.key !== 'Escape') return
      // 메뉴를 닫는 Esc는 편집기 단축키로 넘기지 않는다
      e.stopPropagation()
      setOpen(false)
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
              role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={item.checked}
              className={`${styles.item} ${item.danger ? styles.danger : ''}`}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.checked !== undefined && (
                <span className={styles.mark}>{item.checked && <Check size={14} />}</span>
              )}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
