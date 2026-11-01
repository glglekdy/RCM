import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { isFreeChart, ScrollMap, type AnyChart, type SpeedPoint, type TimingMap, type Track } from '@rcm/core'
import { keysLabel, type TrackKeymap } from '@rcm/playfield'
import type { WaveformPeaks } from '../audio/waveform'
import type { Recorder } from '../input/recorder'
import { ContextMenu, type ContextMenuItem } from '../../ui/ContextMenu'
import { removeMarker } from '../commands/markers'
import { useEditorActions } from '../editorActions'
import { getChart } from '../state/doc'
import { useEditor, useStore } from '../state/useStore'
import { drawFreeNotes } from './drawFree'
import { drawTimeline } from './drawTimeline'
import { createFreeToolController } from './freeTools'
import { createGestureRouter, LONG_PRESS_MS, type GestureEffect, type GesturePointer, type PointerKind } from './gesture'
import { chipAt, type TimelineChip } from './hitTest'
import { longPressMenuItems } from './longPressMenu'
import { timelineTargetAt } from './target'
import { createToolController, type ToolGeometry } from './tools'
import {
  clampPlayheadMs,
  clampZoom,
  layoutFreeTimeline,
  layoutTimeline,
  panPlayhead,
  stepPlayheadMs,
  zoomAround,
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
  const actions = useEditorActions()
  /** 터치 길게 누르기 메뉴 (화면 좌표) */
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])

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

  // 포인터 입력은 제스처 라우터가 도구(그리기·지우기·선택), 스크롤, 핀치 확대, 탭으로 나눈다
  const router = useState(createGestureRouter)[0]
  /** 터치 길게 누르기 타이머 (포인터 id별) */
  const pressTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const clearPressTimer = (id: number) => {
    const timer = pressTimers.current.get(id)
    if (timer === undefined) return
    clearTimeout(timer)
    pressTimers.current.delete(id)
  }
  useEffect(() => {
    const timers = pressTimers.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  /** 터치로 선택 도구를 눌렀을 때의 선택 (길게 누르기 때 복원) */
  const preDownSelection = useRef<ReadonlySet<string> | null>(null)

  const gesturePointer = (e: React.PointerEvent): GesturePointer => {
    const rect = e.currentTarget.getBoundingClientRect()
    const kind: PointerKind = e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse'
    return { id: e.pointerId, kind, x: e.clientX - rect.left, y: e.clientY - rect.top, button: e.button, shift: e.shiftKey }
  }

  /** 도구에 넘길 포인터. 선택 도구에서 추가 선택이 켜져 있으면 Shift를 누른 것으로 친다 */
  const toolPointer = (p: GesturePointer): GesturePointer => {
    const s = store.getState()
    return { ...p, shift: p.shift || (s.tool === 'select' && s.additiveSelect) }
  }

  /** 라우터가 낸 효과를 순서대로 적용한다. 효과마다 최신 상태로 화면을 다시 만든다 */
  const applyEffects = (effects: GestureEffect[]) => {
    for (const [i, fx] of effects.entries()) {
      switch (fx.type) {
        case 'tool-down': {
          // 선택 도구의 터치 누름은 선택을 바꿀 수 있다. 길게 누르기가 되돌릴 수 있게 눌렀을 때의 선택을 기억한다
          const s = store.getState()
          preDownSelection.current = fx.p.kind === 'touch' && s.tool === 'select' ? s.selection : null
          tools().onPointerDown(toolPointer(fx.p))
          break
        }
        case 'tool-move':
          tools().onPointerMove(toolPointer(fx.p))
          break
        case 'tool-up':
          preDownSelection.current = null
          tools().onPointerUp(toolPointer(fx.p))
          break
        case 'tool-cancel':
          // 길게 누르기가 이어서 되돌릴 기억은 남긴다
          if (effects[i + 1]?.type !== 'long-press') preDownSelection.current = null
          tools().cancel()
          break
        case 'pan': {
          const s = store.getState()
          if (s.playing || fx.dy === 0) break
          const { tm, durationMs } = propsRef.current
          const view = { playheadMs: s.playheadMs, pxPerMs: s.pxPerMs, height: sizeRef.current.height }
          store.set({ playheadMs: clampPlayheadMs(tm, panPlayhead(view, fx.dy), durationMs) })
          break
        }
        case 'zoom': {
          const s = store.getState()
          if (s.playing) break
          const { tm, durationMs } = propsRef.current
          const view = { playheadMs: s.playheadMs, pxPerMs: s.pxPerMs, height: sizeRef.current.height }
          const pxPerMs = clampZoom(s.pxPerMs * fx.scale)
          store.set({ pxPerMs, playheadMs: clampPlayheadMs(tm, zoomAround(view, fx.anchorY, pxPerMs), durationMs) })
          break
        }
        case 'tap': {
          const s = store.getState()
          const { tm } = propsRef.current
          const { width, height } = sizeRef.current
          const geometry: ToolGeometry = {
            tm,
            view: { playheadMs: s.playheadMs, pxPerMs: s.pxPerMs, height },
            layout: layoutFor(width, getChart(s.doc, s.activeChart))
          }
          const target = timelineTargetAt(s.doc, s.activeChart, geometry, fx.x, fx.y)
          store.set({ selection: target.kind === 'note' ? new Set([target.key]) : new Set() })
          break
        }
        case 'long-press': {
          const wrap = wrapRef.current
          const s = store.getState()
          if (!wrap || s.playing || s.mode !== 'edit') break
          const { tm } = propsRef.current
          const { width, height } = sizeRef.current
          const geometry: ToolGeometry = {
            tm,
            view: { playheadMs: s.playheadMs, pxPerMs: s.pxPerMs, height },
            layout: layoutFor(width, getChart(s.doc, s.activeChart))
          }
          const target = timelineTargetAt(s.doc, s.activeChart, geometry, fx.x, fx.y)
          // 누르는 순간 토글된 선택(추가 선택)을 먼저 되돌린다
          if (preDownSelection.current) {
            store.set({ selection: preDownSelection.current })
            preDownSelection.current = null
          }
          // 선택에 없는 노트를 누르면 그 노트만 선택하고 메뉴를 연다
          if (target.kind === 'note' && !store.getState().selection.has(target.key)) store.set({ selection: new Set([target.key]) })
          const now = store.getState()
          const items = longPressMenuItems(target, actions, {
            hasSelection: now.selection.size > 0,
            canPaste: now.clipboard !== null,
            deleteMarker: (i) => store.apply('마커 삭제', removeMarker(store.getState().doc, i))
          })
          if (items.length === 0) break
          navigator.vibrate?.(10)
          const rect = wrap.getBoundingClientRect()
          setMenu({ x: rect.left + fx.x, y: rect.top + fx.y, items })
          break
        }
      }
    }
    tools().refresh()
    drawRef.current()
  }

  /** 이벤트 위치의 BPM·변속 칩 */
  const chipUnder = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return chipAt(chipsRef.current, e.clientX - rect.left, e.clientY - rect.top)
  }

  /** 마지막으로 누른 포인터가 터치인가. 칩처럼 라우터를 거치지 않는 누름도 센다 (터치 길게 누르기가 보내는 contextmenu를 막는 데 쓴다) */
  const lastTouchRef = useRef(false)

  const onPointerDown = (e: React.PointerEvent) => {
    lastTouchRef.current = e.pointerType === 'touch'
    // 칩을 누르면 BPM · 변속 탭을 열고 그 지점을 강조한다 (도구에는 넘기지 않는다)
    const chip = !router.active && e.button === 0 ? chipUnder(e) : null
    if (chip) {
      store.set({ panelOpen: true, panelTab: 'timing', focusPoint: { kind: chip.kind, tick: chip.tick } })
      return
    }
    // 드래그가 캔버스 밖으로 나가도 이어지도록 포인터를 붙잡는다 (오른쪽 버튼은 그리기 도구의 지우기 드래그)
    if (e.button === 0 || e.button === 2) e.currentTarget.setPointerCapture(e.pointerId)
    const p = gesturePointer(e)
    applyEffects(router.down(p, store.getState().tool))
    if (p.kind === 'touch' && router.active) {
      clearPressTimer(p.id)
      pressTimers.current.set(
        p.id,
        setTimeout(() => {
          pressTimers.current.delete(p.id)
          applyEffects(router.longPress(p.id))
        }, LONG_PRESS_MS)
      )
    }
  }

  // 버튼을 누르지 않은 이동(호버)은 드래그가 아니므로 다시 그리지 않고, 누르면 할 일을 커서로만 보인다
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (router.active) {
      applyEffects(router.move(gesturePointer(e)))
      return
    }
    if (e.buttons !== 0) return
    if (chipUnder(e)) {
      e.currentTarget.style.cursor = 'pointer'
      return
    }
    if (tool === 'pan') {
      e.currentTarget.style.cursor = 'grab'
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const action = tools().hoverAction(e.clientX - rect.left, e.clientY - rect.top)
    // 레인형은 롱노트 끝(세로), 자유형은 노트 폭(가로)을 바꾼다
    const resize = tools() === freeTools ? 'ew-resize' : 'ns-resize'
    e.currentTarget.style.cursor =
      action === 'resize' ? resize : action === 'move' ? 'move' : action === 'insert' ? 'copy' : ''
  }

  const onPointerUp = (e: React.PointerEvent) => {
    clearPressTimer(e.pointerId)
    applyEffects(router.up(gesturePointer(e)))
  }

  const onPointerCancel = (e: React.PointerEvent) => {
    clearPressTimer(e.pointerId)
    applyEffects(router.cancel(e.pointerId))
  }

  // 우클릭: 트랙 안은 노트 삭제, 트랙 밖(파형·라벨 영역)은 마커 삭제. 터치 길게 누르기가 보낸 것은 막는다
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (lastTouchRef.current || !router.allowsContextMenu()) return
    const rect = e.currentTarget.getBoundingClientRect()
    tools().onContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, button: e.button, shift: e.shiftKey })
    drawRef.current()
  }

  return (
    <div
      ref={wrapRef}
      className={`${styles.wrap} ${tool === 'draw' || tool === 'brush' ? styles.draw : ''} ${tool === 'pan' ? styles.pan : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      onContextMenu={onContextMenu}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
      {menu &&
        createPortal(
          <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} armOnPointerUp />,
          document.body
        )}
    </div>
  )
}
