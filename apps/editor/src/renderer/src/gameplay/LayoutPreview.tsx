import { useEffect, useRef } from 'react'
import { Playfield, type PlayfieldLayout } from '@rcm/playfield'
import { resolveKeymap } from '../../../shared/presets'
import { getPlaytestSpeed } from '../editor/playtest/speedStore'
import { getPresets } from '../presets/presetStore'
import { getHitEffects, useHitEffects } from './hitEffectStore'
import { previewChart } from './previewChart'

/** 시작 전 준비 시간 (첫 노트가 위에서부터 내려오도록) */
const LEAD_MS = 1000
/** 테스트 플레이 화면은 타이틀바(36px) 아래를 모두 덮는다 (PlaytestOverlay.module.css) */
const TITLE_BAR_HEIGHT = 36

/** 지금 창에서 테스트 플레이 화면의 높이 */
const playViewHeight = () => window.innerHeight - TITLE_BAR_HEIGHT

interface LayoutPreviewProps {
  layout: PlayfieldLayout
  className?: string
  /** true면 테스트 플레이 화면 크기로 그린 것을 캔버스에 맞게 줄여 보여 준다 (작은 미리보기) */
  fit?: boolean
}

/** 게임플레이 레이아웃 미리보기: 4키 데모 채보를 자동 플레이로 계속 반복한다. 키 입력은 받지 않는다. */
export function LayoutPreview({ layout, className, fit = false }: LayoutPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playfieldRef = useRef<Playfield | null>(null)
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const hitEffects = useHitEffects()

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
        autoplay: true,
        hitEffects: getHitEffects(),
        viewHeight: fit ? playViewHeight : undefined
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
  }, [fit])

  useEffect(() => {
    playfieldRef.current?.setLayout(layout)
  }, [layout])

  useEffect(() => {
    playfieldRef.current?.setHitEffects(hitEffects)
  }, [hitEffects])

  return <canvas ref={canvasRef} className={className} />
}
