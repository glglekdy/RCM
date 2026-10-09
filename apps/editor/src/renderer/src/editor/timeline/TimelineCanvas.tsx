import { useEffect, useRef } from 'react'
import type { TimingMap } from '@rcm/core'
import { getChart } from '../state/doc'
import { useStore } from '../state/useStore'
import { drawTimeline } from './drawTimeline'
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
      drawTimeline(ctx, {
        view: { playheadMs: s.playheadMs, pxPerMs: s.pxPerMs, height },
        layout: layoutTimeline(width, chart.lanes),
        tm,
        chart,
        snap: s.snap,
        selection: s.selection,
        markers: s.doc.editorData.markers,
        timing: s.doc.song.timing,
        durationMs
      })
    }
    drawRef.current = draw
    draw()
    return store.subscribe(draw)
  }, [store])

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

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  )
}
