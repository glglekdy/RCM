import { useEffect, useRef } from 'react'
import { Playfield, type PlayfieldLayout } from '@rcm/playfield'
import { resolveKeymap } from '../../../shared/presets'
import { getPlaytestSpeed } from '../editor/playtest/speedStore'
import { getPresets } from '../presets/presetStore'
import { previewChart } from './previewChart'

/** 시작 전 준비 시간 (첫 노트가 위에서부터 내려오도록) */
const LEAD_MS = 1000

interface LayoutPreviewProps {
  layout: PlayfieldLayout
  className?: string
}

/** 게임플레이 레이아웃 미리보기: 4키 데모 채보를 자동 플레이로 계속 반복한다. 키 입력은 받지 않는다. */
export function LayoutPreview({ layout, className }: LayoutPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playfieldRef = useRef<Playfield | null>(null)
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { chart, tm, lengthMs } = previewChart()
    const { keys } = resolveKeymap(chart.tracks, getPresets())
    let timer: ReturnType<typeof setTimeout> | undefined
    const run = () => {
      playfieldRef.current?.stop()
      const startedAt = performance.now()
      const pf = new Playfield(canvas, {
        chart,
        tm,
        getTimeMs: () => performance.now() - startedAt - LEAD_MS,
        fromMs: 0,
        speed: getPlaytestSpeed(),
        keymap: keys,
        layout: layoutRef.current,
        input: false,
        autoplay: true
      })
      playfieldRef.current = pf
      pf.start()
      timer = setTimeout(run, LEAD_MS + lengthMs)
    }
    run()
    return () => {
      clearTimeout(timer)
      playfieldRef.current?.stop()
      playfieldRef.current = null
    }
  }, [])

  useEffect(() => {
    playfieldRef.current?.setLayout(layout)
  }, [layout])

  return <canvas ref={canvasRef} className={className} />
}
