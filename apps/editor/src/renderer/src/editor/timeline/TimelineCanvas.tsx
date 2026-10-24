import { useEffect, useRef, useState, type RefObject } from 'react'
import { isFreeChart, ScrollMap, type AnyChart, type SpeedPoint, type TimingMap, type Track } from '@rcm/core'
import { keysLabel, type TrackKeymap } from '@rcm/playfield'
import type { WaveformPeaks } from '../audio/waveform'
import type { Recorder } from '../input/recorder'
import { getChart } from '../state/doc'
import { useEditor, useStore } from '../state/useStore'
import { drawFreeNotes } from './drawFree'
import { drawTimeline } from './drawTimeline'
import { createFreeToolController } from './freeTools'
import { chipAt, type TimelineChip } from './hitTest'
import { createToolController, type ToolGeometry, type ToolPointer } from './tools'
import {
  clampPlayheadMs,
  clampZoom,
  layoutFreeTimeline,
  layoutTimeline,
  stepPlayheadMs,
  type TimelineLayout
} from './view'
import styles from './TimelineCanvas.module.css'

interface TimelineCanvasProps {
  tm: TimingMap
  durationMs: number
  peaks?: WaveformPeaks
  /** 진행 중인 녹음. 눌린 트랙과 (녹음이 실제로 듣는) 키 이름을 겹쳐 그린다 */
  recordingRef?: RefObject<{ recorder: Recorder; keymap: TrackKeymap } | null>
}

/** 트랙 위치별 키 이름 (3.4절 키 배치). 키가 없는 트랙은 `-`. */
function trackKeyLabels(tracks: readonly Track[], keymap: TrackKeymap): string[] {
  return tracks.map((t) => keysLabel(keymap.get(t.id)))
}

const ZOOM_STEP = 1.1

/** 채보 종류에 맞는 타임라인 배치: 레인형은 트랙마다, 자유형은 칸마다 열 하나 */
function layoutFor(width: number, chart: AnyChart): TimelineLayout {
  return isFreeChart(chart) ? layoutFreeTimeline(width, chart.columns) : layoutTimeline(width, chart.tracks)
}

const NO_NOTES: never[] = []

interface ScrollCache {
  speeds: readonly SpeedPoint[] | undefined
  tm: TimingMap
  scroll: ScrollMap
}

export function TimelineCanvas({ tm, durationMs, peaks, recordingRef }: TimelineCanvasProps) {
  const store = useStore()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sizeRef = useRef({ width: 0, height: 0 })
  const propsRef = useRef({ tm, durationMs, peaks, recordingRef })
  propsRef.current = { tm, durationMs, peaks, recordingRef }
  const drawRef = useRef<() => void>(() => {})
  /** 마지막으로 그린 BPM·변속 칩 (클릭·커서용) */
  const chipsRef = useRef<TimelineChip[]>([])
  // 스크롤 맵은 채보의 speeds나 tm이 바뀔 때만 새로 만든다 (재생 중에는 매 프레임 그린다)
  const scrollRef = useRef<ScrollCache | null>(null)
  const tool = useEditor((s) => s.tool)

  // 그리기·지우기·선택 도구 (레인형, 자유형). 좌표계는 입력이 올 때의 화면 크기·상태로 계산한다
  const [{ laneTools, freeTools }] = useState(() => {
    const geometry = (): ToolGeometry => {
      const s = store.getState()
      const { width, height } = sizeRef.current
      return {
        tm: propsRef.current.tm,
        view: { playheadMs: s.playheadMs, pxPerMs: s.pxPerMs, height },
        layout: layoutFor(width, getChart(s.doc, s.activeChart))
      }
    }
    return { laneTools: createToolController(store, geometry), freeTools: createFreeToolController(store, geometry) }
  })
  /** 지금 채보 종류의 도구 */
  const tools = () => {
    const s = store.getState()
    return isFreeChart(getChart(s.doc, s.activeChart)) ? freeTools : laneTools
  }

  // 그리기: 상태가 바뀔 때마다 바로 그린다 (재생 중에는 rAF마다 playheadMs가 바뀐다)
  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      const { width, height } = sizeRef.current
      if (!canvas || !ctx || width === 0 || height === 0) return
      const s = store.getState()
      const chart = getChart(s.doc, s.activeChart)
      const { tm, durationMs, peaks, recordingRef } = propsRef.current
      let cache = scrollRef.current
      if (!cache || cache.speeds !== chart.speeds || cache.tm !== tm) {
        cache = { speeds: chart.speeds, tm, scroll: new ScrollMap(chart.speeds, tm) }
        scrollRef.current = cache
      }
      const recording = s.mode === 'recording' ? recordingRef?.current : null
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      const view = { playheadMs: s.playheadMs, pxPerMs: s.pxPerMs, height }
      const layout = layoutFor(width, chart)
      const free = isFreeChart(chart)
      const { preview, previewInvalid, hiddenKeys, selectRect } = free
        ? { preview: NO_NOTES, previewInvalid: false, hiddenKeys: undefined, selectRect: null }
        : laneTools.overlay()
      const freeOverlay = free ? freeTools.overlay() : null
      chipsRef.current = drawTimeline(ctx, {
        view,
        layout,
        tm,
        scroll: cache.scroll,
        chart: free ? { speeds: chart.speeds, notes: NO_NOTES } : chart,
        drawNotes:
          free && freeOverlay
            ? (c) => drawFreeNotes(c, { view, layout, tm, chart, selection: s.selection, ...freeOverlay })
            : undefined,
        snap: s.snap,
        selection: s.selection,
        markers: s.doc.editorData.markers,
        timing: s.doc.song.timing,
        durationMs,
        peaks,
        preview,
        previewInvalid,
        hiddenKeys,
        selectRect,
        recording: recording && !free
          ? {
              pressed: recording.recorder.pressed(),
              labels: trackKeyLabels(chart.tracks, recording.keymap)
            }
          : undefined
      })
    }
    drawRef.current = draw
    draw()
    return store.subscribe(draw)
  }, [store, laneTools, freeTools])

  useEffect(() => drawRef.current(), [tm, durationMs, peaks])

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
  // 끄는 중에 휠을 굴리면 화면이 움직인 만큼 드래그(선택 사각형·롱노트 길이)를 다시 계산한다
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
      } else {
        const { tm, durationMs } = propsRef.current
        const next = stepPlayheadMs(tm, s.playheadMs, s.snap, e.deltaY > 0 ? -1 : 1)
        store.set({ playheadMs: clampPlayheadMs(tm, next, durationMs) })
      }
      tools().refresh()
      drawRef.current()
    }
    wrap.addEventListener('wheel', onWheel, { passive: false })
    return () => wrap.removeEventListener('wheel', onWheel)
  })

  // Escape: 진행 중인 드래그(미리보기) 취소
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      laneTools.cancel()
      freeTools.cancel()
      drawRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [laneTools, freeTools])

  // 포인터 입력은 도구 컨트롤러로 넘기고 미리보기를 다시 그린다
  const forward =
    (handler: (p: ToolPointer) => void) => (e: React.PointerEvent | React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect()
      handler({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        button: e.button,
        shift: e.shiftKey
      })
      drawRef.current()
    }

  /** 이벤트 위치의 BPM·변속 칩 */
  const chipUnder = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return chipAt(chipsRef.current, e.clientX - rect.left, e.clientY - rect.top)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    // 칩을 누르면 BPM · 변속 탭을 열고 그 지점을 강조한다 (도구에는 넘기지 않는다)
    const chip = e.button === 0 ? chipUnder(e) : null
    if (chip) {
      store.set({ panelOpen: true, panelTab: 'timing', focusPoint: { kind: chip.kind, tick: chip.tick } })
      return
    }
    // 드래그가 캔버스 밖으로 나가도 이어지도록 포인터를 붙잡는다 (오른쪽 버튼은 그리기 도구의 지우기 드래그)
    if (e.button === 0 || e.button === 2) e.currentTarget.setPointerCapture(e.pointerId)
    forward(tools().onPointerDown)(e)
  }

  // 버튼을 누르지 않은 이동(호버)은 드래그가 아니므로 다시 그리지 않고, 누르면 할 일을 커서로만 보인다
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 0) {
      forward(tools().onPointerMove)(e)
      return
    }
    if (chipUnder(e)) {
      e.currentTarget.style.cursor = 'pointer'
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const action = tools().hoverAction(e.clientX - rect.left, e.clientY - rect.top)
    // 레인형은 롱노트 끝(세로), 자유형은 노트 폭(가로)을 바꾼다
    const resize = tools() === freeTools ? 'ew-resize' : 'ns-resize'
    e.currentTarget.style.cursor =
      action === 'resize' ? resize : action === 'move' ? 'move' : action === 'insert' ? 'copy' : ''
  }

  // 우클릭: 트랙 안은 노트 삭제, 트랙 밖(파형·라벨 영역)은 마커 삭제
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    forward(tools().onContextMenu)(e)
  }

  const onLostPointerCapture = () => {
    tools().cancel()
    drawRef.current()
  }

  return (
    <div
      ref={wrapRef}
      className={`${styles.wrap} ${tool === 'draw' || tool === 'brush' ? styles.draw : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => forward(tools().onPointerUp)(e)}
      onLostPointerCapture={onLostPointerCapture}
      onContextMenu={onContextMenu}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  )
}
