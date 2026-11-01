import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { placeMenu } from './menuPlacement'
import styles from './Menu.module.css'

export interface ContextMenuItem {
  label: string
  onSelect: () => void
  disabled?: boolean
  danger?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
  /**
   * 터치로 길게 눌러 띄운 메뉴. 메뉴가 뜬 뒤 메뉴 안에서 새로 누른 포인터(또는 키보드)만 항목을 고른다.
   * 띄울 때 누르고 있던 손가락을 떼며 생기는 click(iOS는 늦게 보낸다)은 항목을 고르지 않는다.
   * 누른 점을 덮지 않게 띄운다
   */
  longPress?: boolean
}

/** 메뉴 안의 포인터 입력이 React 부모(포털로 그린 경우 메뉴를 연 화면)로 올라가지 않게 한다 */
const stopPropagation = (e: PointerEvent) => e.stopPropagation()

/** 화면 좌표(x, y)에 바로 띄우는 메뉴. 우클릭 메뉴와 터치 길게 누르기 메뉴용. */
export function ContextMenu({ x, y, items, onClose, longPress = false }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  /** 항목을 고를 수 있는가. 길게 누르기 메뉴는 메뉴 안에서 새로 누를 때부터 */
  const armedRef = useRef(!longPress)
  const [pos, setPos] = useState({ left: x, top: y })

  useEffect(() => {
    const onDown = (e: globalThis.PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 메뉴를 닫는 Esc는 편집기 단축키로 넘기지 않는다
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  // 실제 크기를 재서 화면 안(가장자리 여백 포함)으로 옮긴다. 폰에서는 항목이 더 높다
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const { left, top } = placeMenu(x, y, { width, height }, viewport, longPress)
    setPos((p) => (p.left === left && p.top === top ? p : { left, top }))
  }, [x, y, items.length, longPress])

  return (
    <div
      ref={ref}
      className={`${styles.popup} ${styles.floating}`}
      style={pos}
      role="menu"
      onPointerDown={(e) => {
        e.stopPropagation()
        armedRef.current = true
      }}
      onPointerMove={stopPropagation}
      onPointerUp={stopPropagation}
      onPointerCancel={stopPropagation}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`${styles.item} ${item.danger ? styles.danger : ''}`}
          disabled={item.disabled}
          onClick={(e) => {
            // 키보드로 누른 click은 detail이 0이다
            if (!armedRef.current && e.detail !== 0) return
            onClose()
            item.onSelect()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
