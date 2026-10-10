import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { dropSlot, slotToIndex } from './reorder'
import styles from './SortableList.module.css'

export interface DragHandle {
  onPointerDown(e: ReactPointerEvent): void
}

interface SortableListProps<T> {
  items: readonly T[]
  /** 모든 행의 높이(px). 놓일 칸 계산에 쓴다 */
  rowHeight: number
  getKey(item: T): string
  /** `to`는 옮긴 뒤 위치. 같은 자리에 놓으면 호출하지 않는다 */
  onMove(from: number, to: number): void
  renderRow(item: T, index: number, handle: DragHandle): ReactNode
}

interface Drag {
  from: number
  /** 끌기 시작할 때 from 행의 key. 끄는 동안 목록이 바뀌어 다른 행이 그 자리에 오면 취소한다 */
  key: string
  pointerId: number
  startY: number
  dy: number
  /** 놓일 칸 0..items.length. 리스트 밖이면 null (놓으면 취소) */
  slot: number | null
}

/**
 * 손잡이를 끌어 순서를 바꾸는 목록. 끄는 행은 반투명하게 따라오고, 놓일 칸에 가로선이 보인다.
 * Esc를 누르거나 리스트 밖에서 놓으면 취소.
 */
export function SortableList<T>({ items, rowHeight, getKey, onMove, renderRow }: SortableListProps<T>) {
  const listRef = useRef<HTMLDivElement>(null)
  const [drag, setDragState] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const onMoveRef = useRef(onMove)
  /** 놓을 때의 목록에서 끈 행이 아직 from 자리에 있는지 */
  const isAtRef = useRef<(from: number, key: string) => boolean>(() => false)
  const count = items.length

  useEffect(() => {
    onMoveRef.current = onMove
    isAtRef.current = (from, key) => from < items.length && getKey(items[from]) === key
  }, [onMove, items, getKey])

  const setDrag = (d: Drag | null) => {
    dragRef.current = d
    setDragState(d)
  }

  const dragging = drag !== null
  useEffect(() => {
    if (!dragging) return
    const slotAt = (e: PointerEvent): number | null => {
      const list = listRef.current
      if (!list) return null
      const r = list.getBoundingClientRect()
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null
      return dropSlot(e.clientY, r.top, rowHeight, count)
    }
    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      setDrag({ ...d, dy: e.clientY - d.startY, slot: slotAt(e) })
    }
    const onPointerUp = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      setDrag(null)
      const slot = slotAt(e)
      if (slot === null) return
      if (!isAtRef.current(d.from, d.key)) return
      const to = slotToIndex(d.from, slot)
      if (to !== d.from) onMoveRef.current(d.from, to)
    }
    const onCancel = () => setDrag(null)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 끌기를 취소하는 Esc는 다른 곳(창 닫기 등)으로 넘기지 않는다
      e.preventDefault()
      e.stopPropagation()
      setDrag(null)
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [dragging, rowHeight, count])

  const handleFor = (index: number): DragHandle => ({
    onPointerDown: (e) => {
      if (e.button !== 0 || dragRef.current) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      setDrag({
        from: index,
        key: getKey(items[index]),
        pointerId: e.pointerId,
        startY: e.clientY,
        dy: 0,
        slot: index
      })
    }
  })

  return (
    <div ref={listRef} className={`${styles.list} ${drag ? styles.dragging : ''}`}>
      {items.map((item, i) => {
        const isDragged = drag?.from === i
        // 끄는 행은 리스트 안에서만 움직인다
        const dy = isDragged
          ? Math.min((count - 1 - i) * rowHeight, Math.max(-i * rowHeight, drag.dy))
          : 0
        return (
          <div
            key={getKey(item)}
            className={`${styles.row} ${isDragged ? styles.dragged : ''}`}
            style={{ height: rowHeight, transform: dy ? `translateY(${dy}px)` : undefined }}
          >
            {renderRow(item, i, handleFor(i))}
          </div>
        )
      })}
      {drag && drag.slot !== null && (
        <div className={styles.dropLine} style={{ top: drag.slot * rowHeight - 1 }} />
      )}
    </div>
  )
}
