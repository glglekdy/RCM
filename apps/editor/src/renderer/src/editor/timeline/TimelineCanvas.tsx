import { useEffect, useRef, useState } from 'react'
import type { TimingMap } from '@rcm/core'
import { getChart } from '../state/doc'
import { useEditor, useStore } from '../state/useStore'
import { drawTimeline } from './drawTimeline'
import { createToolController, type ToolGeometry, type ToolPointer } from './tools'
import { clampPlayheadMs, clampZoom, layoutTimeline, stepPlayheadMs } from './view'
import styles from './TimelineCanvas.module.css'

interface TimelineCanvasProps {
  tm: TimingMap
  durationMs: number
}

const ZOOM_STEP = 1.1

export function TimelineCanvas({ tm, durationMs }: TimelineCanvasProps) {
  const store = useStore()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sizeRef = useRef({ width: 0, height: 0 })
  const propsRef = useRef({ tm, durationMs })
  propsRef.current = { tm, durationMs }
  const drawRef = useRef<() => void>(() => {})
  const tool = useEditor((s) => s.tool)

  // 그리기·지우기 도구. 좌표계는 입력이 올 때의 화면 크기·상태로 계산한다
  const [tools] = useState(() =>
    createToolController(store, (): ToolGeometry => {
      const s = store.getState()
      const { width, height } = sizeRef.current
      return {
        tm: propsRef.current.tm,
        view: { playheadMs: s.playheadMs, pxPerMs: s.pxPerMs, height },
        layout: layoutTimeline(width, getChart(s.doc, s.activeChart).lanes)
      }
    })
  )

  // 그리기: 상태가 바뀔 때마다 바로 그린다 (재생 중에는 rAF마다 playheadMs가 바뀐다)
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      const { width, height } = sizeRef.current
      if (!canvas || !ctx || width === 0 || height === 0) return
      const s = store.getState()
      const chart = getChart(s.doc, s.activeChart)
      const { tm, durationMs } = propsRef.current
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      const { preview, hiddenKeys } = tools.overlay()
      drawTimeline(ctx, {
        view: { playheadMs: s.playheadMs, pxPerMs: s.pxPerMs, height },
        layout: layoutTimeline(width, chart.lanes),
        tm,
        chart,
        snap: s.snap,
        selection: s.selection,
        markers: s.doc.editorData.markers,
        timing: s.doc.song.timing,
        durationMs,
        preview,
        hiddenKeys
      })
    }
    drawRef.current = draw
    draw()
    return store.subscribe(draw)
  }, [store, tools])

  useEffect(() => drawRef.current(), [tm, durationMs])

  // 크기 추적 (devicePixelRatio 반영)
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ro = new ResizeObserver(() => {
      const width = wrap.clientWidth
      const height = wrap.clientHeight
      const dpr = window.devicePixelRatio || 1
      sizeRef.current = { width, height }
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      drawRef.current()
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // 휠: 정지 중 스냅 한 칸 이동, Ctrl+휠 확대/축소. 재생 중에는 무시
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const s = store.getState()
      if (s.playing || e.deltaY === 0) return
      if (e.ctrlKey) {
        const pxPerMs = clampZoom(s.pxPerMs * ZOOM_STEP ** (e.deltaY < 0 ? 1 : -1))
        store.set({ pxPerMs })
        return
      }
      const { tm, durationMs } = propsRef.current
      const next = stepPlayheadMs(tm, s.playheadMs, s.snap, e.deltaY > 0 ? -1 : 1)
      store.set({ playheadMs: clampPlayheadMs(tm, next, durationMs) })
    }
    wrap.addEventListener('wheel', onWheel, { passive: false })
    return () => wrap.removeEventListener('wheel', onWheel)
  }, [store])

  // Escape: 진행 중인 드래그(미리보기) 취소
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      tools.cancel()
      drawRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tools])

  // 포인터 입력은 도구 컨트롤러로 넘기고 미리보기를 다시 그린다
  const forward =
    (handler: (p: ToolPointer) => void) => (e: React.PointerEvent | React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect()
      handler({ x: e.clientX - rect.left, y: e.clientY - rect.top, button: e.button })
      drawRef.current()
    }

  const onPointerDown = (e: React.PointerEvent) => {
    // 드래그가 캔버스 밖으로 나가도 이어지도록 포인터를 붙잡는다
    if (e.button === 0) e.currentTarget.setPointerCapture(e.pointerId)
    forward(tools.onPointerDown)(e)
  }

  // 버튼을 누르지 않은 이동(호버)은 드래그가 아니므로 다시 그리지 않는다
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons !== 0) forward(tools.onPointerMove)(e)
  }

  // 우클릭: 레인 안은 노트 삭제, 레인 밖(파형·라벨 영역)은 마커 삭제
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    forward(tools.onContextMenu)(e)
  }

  const onLostPointerCapture = () => {
    tools.cancel()
    drawRef.current()
  }

  return (
    <div
      ref={wrapRef}
      className={`${styles.wrap} ${tool === 'draw' ? styles.draw : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={forward(tools.onPointerUp)}
      onLostPointerCapture={onLostPointerCapture}
      onContextMenu={onContextMenu}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  )
}
