import { useEffect, useRef, useState } from 'react'
import { isFreeChart, type TimingMap } from '@rcm/core'
import {
  clampSpeed,
  DEFAULT_PLAYFIELD_COLORS,
  FreePlayfield,
  Playfield,
  SPEED_STEP,
  type FreeAspect,
  type Judgement
} from '@rcm/playfield'
import { resolveKeymap } from '../../../../shared/presets'
import { getPresets } from '../../presets/presetStore'
import { getChart } from '../state/doc'
import { useEditor } from '../state/useStore'
import { getHitEffects, useHitEffects } from '../../gameplay/hitEffectStore'
import { getLayout } from '../../gameplay/layoutStore'
import { getPlaytestSpeed, setPlaytestSpeed } from './speedStore'
import styles from './PlaytestOverlay.module.css'

/** 판정 개수를 화면에 옮기는 간격(ms) */
const STATS_INTERVAL_MS = 100

/** 자유형 채보의 폰 화면 방향. 이번 실행 동안 기억한다 */
let lastAspect: FreeAspect = 'portrait'

interface PlaytestOverlayProps {
  fromMs: number
  tm: TimingMap
  /** 곡 기준 현재 시각 (에디터 오디오 엔진의 시계) */
  getTimeMs: () => number
  /** 자동 플레이 (F4로 켜고 끈다) */
  autoplay: boolean
  onExit: () => void
}

interface Stats {
  counts: Record<Judgement, number>
  maxCombo: number
}

const ROWS: { key: Judgement; label: string }[] = [
  { key: 'perfect', label: 'PERFECT' },
  { key: 'great', label: 'GREAT' },
  { key: 'good', label: 'GOOD' },
  { key: 'miss', label: 'MISS' }
]

/** 편집 화면 위를 덮는 테스트 플레이 화면 (5.11절). 결과는 저장하지 않는다. */
export function PlaytestOverlay({ fromMs, tm, getTimeMs, autoplay, onExit }: PlaytestOverlayProps) {
  const chart = useEditor((s) => getChart(s.doc, s.activeChart))
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playfieldRef = useRef<Playfield | FreePlayfield | null>(null)
  const free = isFreeChart(chart)
  const [aspect, setAspect] = useState<FreeAspect>(lastAspect)
  const aspectRef = useRef(aspect)
  aspectRef.current = aspect
  // 지난 테스트 플레이의 배속으로 시작한다
  const [speed, setSpeed] = useState(getPlaytestSpeed)
  const speedRef = useRef(speed)
  speedRef.current = speed
  const autoplayRef = useRef(autoplay)
  autoplayRef.current = autoplay
  const hitEffects = useHitEffects()
  const [stats, setStats] = useState<Stats>({
    counts: { perfect: 0, great: 0, good: 0, miss: 0 },
    maxCombo: 0
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const common = {
      tm,
      getTimeMs,
      fromMs,
      speed: speedRef.current,
      layout: getLayout(),
      autoplay: autoplayRef.current,
      hitEffects: getHitEffects()
    }
    const pf = isFreeChart(chart)
      ? new FreePlayfield(canvas, { ...common, chart, aspect: aspectRef.current })
      : new Playfield(canvas, { ...common, chart, keymap: resolveKeymap(chart.tracks, getPresets()).keys })
    playfieldRef.current = pf
    pf.start()
    const timer = setInterval(() => {
      const { counts, maxCombo } = pf.state
      setStats((prev) =>
        prev.maxCombo === maxCombo && ROWS.every((r) => prev.counts[r.key] === counts[r.key])
          ? prev
          : { counts: { ...counts }, maxCombo }
      )
    }, STATS_INTERVAL_MS)
    return () => {
      clearInterval(timer)
      pf.stop()
      playfieldRef.current = null
    }
  }, [chart, tm, getTimeMs, fromMs])

  useEffect(() => {
    playfieldRef.current?.setSpeed(speed)
  }, [speed])

  useEffect(() => {
    playfieldRef.current?.setAutoplay(autoplay)
  }, [autoplay])

  // 이펙트 이미지는 늦게 읽힐 수 있어 바뀌면 바로 넘긴다
  useEffect(() => {
    playfieldRef.current?.setHitEffects(hitEffects)
  }, [hitEffects])

  useEffect(() => {
    const pf = playfieldRef.current
    if (pf instanceof FreePlayfield) pf.setAspect(aspect)
    lastAspect = aspect
  }, [aspect])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // 타이틀바 버튼 등으로 포커스가 옮겨 가 키 입력이 엉뚱한 곳에 들어가지 않게 한다
      if (e.key === 'Tab') {
        e.preventDefault()
        return
      }
      if (e.code === 'F6') {
        e.preventDefault()
        setAspect((a) => (a === 'portrait' ? 'landscape' : 'portrait'))
        return
      }
      if (e.code !== 'ArrowUp' && e.code !== 'ArrowDown') return
      e.preventDefault()
      const step = e.code === 'ArrowUp' ? SPEED_STEP : -SPEED_STEP
      const next = clampSpeed(speedRef.current + step)
      setSpeed(next)
      setPlaytestSpeed(next)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className={styles.overlay}>
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.hud}>
        <div className={styles.controls}>
          <span>배속 {speed.toFixed(1)} (↑/↓)</span>
          <span className={styles.dot}>·</span>
          <span>F5 다시 시작</span>
          <span className={styles.dot}>·</span>
          <span className={autoplay ? styles.autoOn : undefined}>
            자동 {autoplay ? '켬' : '끔'} (F4)
          </span>
          {free && (
            <>
              <span className={styles.dot}>·</span>
              <button
                type="button"
                className={styles.exit}
                onClick={() => setAspect((a) => (a === 'portrait' ? 'landscape' : 'portrait'))}
              >
                {aspect === 'portrait' ? '세로' : '가로'} 화면 (F6)
              </button>
            </>
          )}
          <span className={styles.dot}>·</span>
          <button type="button" className={styles.exit} onClick={onExit}>
            Esc 종료
          </button>
        </div>
        {free && <p className={styles.hint}>마우스·터치로 쳐요. 터치 화면이면 여러 손가락도 돼요.</p>}
        <dl className={styles.stats}>
          {ROWS.map((r) => (
            <div key={r.key} className={styles.stat}>
              <dt style={{ color: DEFAULT_PLAYFIELD_COLORS[r.key] }}>{r.label}</dt>
              <dd>{stats.counts[r.key]}</dd>
            </div>
          ))}
          <div className={styles.stat}>
            <dt>최대 콤보</dt>
            <dd>{stats.maxCombo}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
