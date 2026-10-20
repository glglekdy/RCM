import { useEffect, useRef } from 'react'
import { isFreeChart, type AnyChart, type FreeChart, type Marker, type TimingMap, type TimingPoint } from '@rcm/core'
import { FREE_NOTE_COLORS } from '@rcm/playfield'
import { getChart } from '../state/doc'
import { useStore } from '../state/useStore'
import { clampPlayheadMs, layoutTimeline, type TimelineView } from '../timeline/view'
import {
  MINIMAP_WIDTH,
  minimapDyToMs,
  minimapViewport,
  minimapYToMs,
  msToMinimapY
} from './geometry'
import styles from './Minimap.module.css'

interface MinimapProps {
  tm: TimingMap
  durationMs: number
}

/** 스펙 6.3절 색 (토큰 --accent, --accent-soft 값) */
const COLORS = {
  bpm: '#f59e0b',
  marker: '#22d3ee',
  accent: '#8b5cf6',
  boxFill: 'rgba(139, 92, 246, 0.18)',
  boxFillHover: 'rgba(139, 92, 246, 0.28)'
}

const PADDING = 4
const TICK_LENGTH = 6
const TAP_HEIGHT = 2
const TRACK_GAP = 1
/** 노트 막대는 트랙 색을 이만큼 흐리게 */
const NOTE_ALPHA = 0.7
/** 기믹 노트는 플레이 노트보다 흐리게 (NOTE_ALPHA에 곱한다) */
const GIMMICK_ALPHA = 0.4

const crisp = (v: number) => Math.round(v) + 0.5

interface StaticInput {
  chart: AnyChart
  timing: TimingPoint[]
  markers: Marker[]
  tm: TimingMap
  durationMs: number
  width: number
  height: number
  dpr: number
}

/** 노트·BPM·마커: 바뀔 때만 오프스크린 캔버스에 다시 그린다. */
function drawStatic(canvas: HTMLCanvasElement, p: StaticInput): void {
  canvas.width = Math.round(p.width * p.dpr)
  canvas.height = Math.round(p.height * p.dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(p.dpr, 0, 0, p.dpr, 0, 0)
  ctx.clearRect(0, 0, p.width, p.height)
  if (p.durationMs <= 0) return

  const { tm, durationMs, height } = p
  const y = (ms: number) => msToMinimapY(ms, height, durationMs)
  if (isFreeChart(p.chart)) drawFreeStatic(ctx, p, p.chart, y)
  else drawLaneStatic(ctx, p, y)

  ctx.fillStyle = COLORS.bpm
  for (const point of p.timing) {
    ctx.fillRect(0, Math.round(y(tm.tickToMs(point.tick))), TICK_LENGTH, 1)
  }
  ctx.fillStyle = COLORS.marker
  for (const marker of p.markers) {
    ctx.fillRect(p.width - TICK_LENGTH, Math.round(y(marker.ms)), TICK_LENGTH, 1)
  }
}

/** 자유형 노트: 칸 수를 띠 폭에 맞춰 종류별 색 막대로, 슬라이드는 지점을 이은 띠로 그린다. */
function drawFreeStatic(
  ctx: CanvasRenderingContext2D,
  p: StaticInput,
  chart: FreeChart,
  y: (ms: number) => number
): void {
  const { tm } = p
  const scale = (p.width - 2 * PADDING) / chart.columns
  const xOf = (col: number) => PADDING + col * scale
  ctx.globalAlpha = NOTE_ALPHA
  for (const note of chart.notes) {
    if (note.type === 'slide') {
      const gimmick = note.gimmick === undefined ? undefined : chart.gimmicks?.find((g) => g.name === note.gimmick)
      ctx.fillStyle = gimmick ? gimmick.color : FREE_NOTE_COLORS.slide
      ctx.globalAlpha = gimmick ? NOTE_ALPHA * GIMMICK_ALPHA : NOTE_ALPHA
      ctx.beginPath()
      note.points.forEach((pt, i) => {
        const yy = y(tm.tickToMs(pt.tick))
        if (i === 0) ctx.moveTo(xOf(pt.x), yy)
        else ctx.lineTo(xOf(pt.x), yy)
      })
      for (let i = note.points.length - 1; i >= 0; i--) {
        const pt = note.points[i]
        ctx.lineTo(xOf(pt.x + pt.width), y(tm.tickToMs(pt.tick)))
      }
      ctx.closePath()
      ctx.fill()
      continue
    }
    if (note.type === 'gimmick') {
      // 기믹 노트는 판정 대상이 아니므로 흐리게
      ctx.fillStyle = chart.gimmicks?.find((g) => g.name === note.gimmick)?.color ?? FREE_NOTE_COLORS.tap
      ctx.globalAlpha = NOTE_ALPHA * GIMMICK_ALPHA
    } else {
      ctx.fillStyle = FREE_NOTE_COLORS[note.type]
      ctx.globalAlpha = NOTE_ALPHA
    }
    const start = Math.round(y(tm.tickToMs(note.tick)))
    ctx.fillRect(xOf(note.x), start - TAP_HEIGHT / 2, Math.max(1, note.width * scale - TRACK_GAP), TAP_HEIGHT)
  }
  ctx.globalAlpha = 1
}

function drawLaneStatic(ctx: CanvasRenderingContext2D, p: StaticInput, y: (ms: number) => number): void {
  if (isFreeChart(p.chart)) return
  const { tm } = p
  // 트랙 열을 타임라인과 같은 폭 비율로 띠 폭에 맞춘다
  const layout = layoutTimeline(0, p.chart.tracks)
  const scale = (p.width - 2 * PADDING) / layout.totalWidth
  const columns = new Map(
    layout.columns.map((c) => [
      c.id,
      { x: PADDING + (c.x - layout.tracksX) * scale, width: c.width * scale, color: c.color, gimmick: c.gimmick }
    ])
  )

  // 막대는 픽셀 경계에 맞추고, 옆 트랙과 붙지 않게 1px 띄운다
  ctx.globalAlpha = NOTE_ALPHA
  for (const note of p.chart.notes) {
    const col = columns.get(note.track)
    if (!col) continue
    ctx.fillStyle = col.color
    // 기믹 노트는 판정 대상이 아니므로 흐리게
    ctx.globalAlpha = col.gimmick ? NOTE_ALPHA * GIMMICK_ALPHA : NOTE_ALPHA
    const start = Math.round(y(tm.tickToMs(note.tick)))
    if (note.type === 'hold') {
      const end = Math.round(y(tm.tickToMs(note.endTick)))
      ctx.fillRect(col.x, end, col.width - TRACK_GAP, Math.max(TAP_HEIGHT, start - end))
    } else {
      ctx.fillRect(col.x, start - TAP_HEIGHT / 2, col.width - TRACK_GAP, TAP_HEIGHT)
    }
  }
  ctx.globalAlpha = 1
}

/** VS Code 미니맵처럼 곡 전체를 축소해 보여 주고, 클릭·드래그로 재생선을 옮긴다. */
export function Minimap({ tm, durationMs }: MinimapProps) {
  const store = useStore()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sizeRef = useRef({ width: 0, height: 0 })
  const propsRef = useRef({ tm, durationMs })
  propsRef.current = { tm, durationMs }
  const drawRef = useRef<() => void>(() => {})
  const hoverRef = useRef(false)
  const dragRef = useRef<{ startY: number; startMs: number } | null>(null)

  // 타임라인과 같은 높이에 보이는 범위
  const viewport = () => {
    const s = store.getState()
    const { height } = sizeRef.current
    const view: TimelineView = { playheadMs: s.playheadMs, pxPerMs: s.pxPerMs, height }
    return minimapViewport(view, height, propsRef.current.durationMs)
  }

  useEffect(() => {
    const layer = document.createElement('canvas')
    let last: StaticInput | null = null

    const draw = () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      const { width, height } = sizeRef.current
      if (!canvas || !ctx || width === 0 || height === 0) return
      const s = store.getState()
      const { tm, durationMs } = propsRef.current
      const input: StaticInput = {
        chart: getChart(s.doc, s.activeChart),
        timing: s.doc.song.timing,
        markers: s.doc.editorData.markers,
        tm,
        durationMs,
        width,
        height,
        dpr: window.devicePixelRatio || 1
      }
      const changed =
        !last || (Object.keys(input) as (keyof StaticInput)[]).some((k) => input[k] !== last?.[k])
      if (changed) {
        drawStatic(layer, input)
        last = input
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(layer, 0, 0)
      if (durationMs <= 0) return
      ctx.setTransform(input.dpr, 0, 0, input.dpr, 0, 0)

      const box = viewport()
      ctx.fillStyle = hoverRef.current ? COLORS.boxFillHover : COLORS.boxFill
      ctx.fillRect(0, box.top, width, box.bottom - box.top)
      ctx.strokeStyle = COLORS.accent
      ctx.lineWidth = 1
      ctx.strokeRect(0.5, crisp(box.top), width - 1, Math.round(box.bottom) - Math.round(box.top))

      const playY = crisp(msToMinimapY(s.playheadMs, height, durationMs))
      ctx.beginPath()
      ctx.moveTo(0, playY)
      ctx.lineTo(width, playY)
      ctx.stroke()
    }
    drawRef.current = draw
    draw()
    // 재생 중에는 화면 프레임마다 playheadMs가 바뀌어 다시 그린다
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

  const pointerY = (e: React.PointerEvent) => e.clientY - e.currentTarget.getBoundingClientRect().top

  const insideBox = (y: number) => {
    const box = viewport()
    return y >= box.top && y <= box.bottom
  }

  const setHover = (hover: boolean) => {
    if (hoverRef.current === hover) return
    hoverRef.current = hover
    drawRef.current()
  }

  const seek = (ms: number) => {
    const { tm, durationMs } = propsRef.current
    store.set({ playheadMs: clampPlayheadMs(tm, ms, durationMs) })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const { durationMs } = propsRef.current
    if (e.button !== 0 || store.getState().playing || durationMs <= 0) return
    const { height } = sizeRef.current
    const y = pointerY(e)
    // 상자 밖을 누르면 그 자리로 옮긴 뒤 그대로 드래그를 이어간다
    if (!insideBox(y)) seek(minimapYToMs(y, height, durationMs))
    dragRef.current = { startY: y, startMs: store.getState().playheadMs }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const y = pointerY(e)
    const drag = dragRef.current
    if (!drag) {
      setHover(propsRef.current.durationMs > 0 && insideBox(y))
      return
    }
    if (store.getState().playing) return
    const { height } = sizeRef.current
    seek(drag.startMs + minimapDyToMs(y - drag.startY, height, propsRef.current.durationMs))
  }

  const endDrag = () => {
    dragRef.current = null
  }

  return (
    <div
      ref={wrapRef}
      className={styles.wrap}
      style={{ width: MINIMAP_WIDTH }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onLostPointerCapture={endDrag}
      onPointerLeave={() => setHover(false)}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  )
}
