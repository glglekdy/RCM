import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { sheetHeightPx, stageAfterDrag, type SheetStage } from './sheetStage'
import styles from './BottomSheet.module.css'

/** 이만큼 안 움직인 눌렀다 뗌은 끌기가 아니라 탭이다 */
const TAP_SLOP_PX = 4

interface BottomSheetProps {
  stage: SheetStage
  onStageChange: (stage: SheetStage) => void
  /** 손잡이 아래, 본문 위에 늘 보이는 영역 (패널 탭 줄 등) */
  header?: ReactNode
  children: ReactNode
}

interface Drag {
  pointerId: number
  startY: number
  startStage: SheetStage
}

/**
 * 부모(위치가 정해진 영역) 아래쪽에 붙는 시트. 높이는 부모 높이 기준 단계 높이다.
 * 반 열림에서도 뒤의 화면은 그대로 눌린다(배경 막음 없음). closed면 아무것도 그리지 않는다.
 */
export function BottomSheet({ stage, onStageChange, header, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(0)
  /** 끄는 동안의 높이(px). null이면 단계 높이 */
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const drag = useRef<Drag | null>(null)
  const closed = stage === 'closed'

  // 부모 높이를 잰다 (뷰포트 단위가 아니라 부모 기준: full = 부모 높이)
  useLayoutEffect(() => {
    const parent = sheetRef.current?.parentElement
    if (!parent) return
    const measure = () => setAvailable(parent.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [closed])

  if (closed) return null

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || drag.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { pointerId: e.pointerId, startY: e.clientY, startStage: stage }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const dy = e.clientY - d.startY
    if (dragHeight === null && Math.abs(dy) < TAP_SLOP_PX) return
    const height = sheetHeightPx(d.startStage, available) - dy
    setDragHeight(Math.min(available, Math.max(0, height)))
  }

  const finish = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    drag.current = null
    const dy = e.clientY - d.startY
    setDragHeight(null)
    if (Math.abs(dy) < TAP_SLOP_PX) return
    const next = stageAfterDrag(d.startStage, dy, available)
    if (next !== d.startStage) onStageChange(next)
  }

  const height = dragHeight ?? sheetHeightPx(stage, available)

  return (
    <div
      ref={sheetRef}
      className={`${styles.sheet} ${dragHeight === null ? '' : styles.dragging}`}
      style={{ height }}
    >
      <div
        className={styles.handle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        <span className={styles.grip} />
      </div>
      {header && <div className={styles.header}>{header}</div>}
      <div className={styles.body}>{children}</div>
    </div>
  )
}
