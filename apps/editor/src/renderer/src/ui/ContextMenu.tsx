import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
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
  /** 길게 눌러 띄운 메뉴용: 누르고 있던 손가락을 떼기 전에는 항목이 눌리지 않는다 */
  armOnPointerUp?: boolean
}

/** 화면 가장자리에서 메뉴를 띄우는 여백(px) */
const EDGE = 8

/** 메뉴 안의 포인터 입력이 React 부모(포털로 그린 경우 메뉴를 연 화면)로 올라가지 않게 한다 */
const stopPropagation = (e: PointerEvent) => e.stopPropagation()

/** 화면 좌표(x, y)에 바로 띄우는 메뉴. 우클릭 메뉴와 터치 길게 누르기 메뉴용. */
export function ContextMenu({ x, y, items, onClose, armOnPointerUp = false }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const armedRef = useRef(!armOnPointerUp)
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

  // 손가락을 뗀 뒤(그 손가락이 보내는 click까지 지나간 다음)부터 항목을 받는다. 취소로 끝나도 푼다
  useEffect(() => {
    if (!armOnPointerUp) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      timer ??= setTimeout(() => {
        armedRef.current = true
      }, 0)
    }
    // 캡처 단계: 메뉴 위에서 뗀 포인터도 놓치지 않는다
    window.addEventListener('pointerup', arm, true)
    window.addEventListener('pointercancel', arm, true)
    return () => {
      window.removeEventListener('pointerup', arm, true)
      window.removeEventListener('pointercancel', arm, true)
      clearTimeout(timer)
    }
  }, [armOnPointerUp])

  // 실제 크기를 재서 화면 안(가장자리 여백 포함)으로 옮긴다. 폰에서는 항목이 더 높다
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const left = Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE))
    const top = Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE))
    setPos((p) => (p.left === left && p.top === top ? p : { left, top }))
  }, [x, y, items.length])

  return (
    <div
      ref={ref}
      className={`${styles.popup} ${styles.floating}`}
      style={pos}
      role="menu"
      onPointerDown={stopPropagation}
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
          onClick={() => {
            if (!armedRef.current) return
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
