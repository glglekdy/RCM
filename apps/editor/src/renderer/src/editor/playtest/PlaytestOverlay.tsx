import { useEffect, useRef, useState } from 'react'
import type { TimingMap } from '@rcm/core'
import {
  clampSpeed,
  DEFAULT_PLAYFIELD_COLORS,
  DEFAULT_SPEED,
  Playfield,
  type Judgement
} from '@rcm/playfield'
import { DEFAULT_PRESETS, resolveKeymap } from '../../../../shared/presets'
import { getChart } from '../state/doc'
import { useEditor } from '../state/useStore'
import styles from './PlaytestOverlay.module.css'

/** ↑/↓ 한 번에 바뀌는 노트 속도 */
const SPEED_STEP = 0.5
/** 판정 개수를 화면에 옮기는 간격(ms) */
const STATS_INTERVAL_MS = 100

interface PlaytestOverlayProps {
  fromMs: number
  tm: TimingMap
  /** 곡 기준 현재 시각 (에디터 오디오 엔진의 시계) */
  getTimeMs: () => number
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
export function PlaytestOverlay({ fromMs, tm, getTimeMs, onExit }: PlaytestOverlayProps) {
  const chart = useEditor((s) => getChart(s.doc, s.activeChart))
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playfieldRef = useRef<Playfield | null>(null)
  const [speed, setSpeed] = useState(DEFAULT_SPEED)
  const [stats, setStats] = useState<Stats>({
    counts: { perfect: 0, great: 0, good: 0, miss: 0 },
    maxCombo: 0
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { keys: keymap } = resolveKeymap(chart.tracks, DEFAULT_PRESETS)
    const pf = new Playfield(canvas, { chart, tm, getTimeMs, fromMs, speed: DEFAULT_SPEED, keymap })
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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'ArrowUp' && e.code !== 'ArrowDown') return
      e.preventDefault()
      const step = e.code === 'ArrowUp' ? SPEED_STEP : -SPEED_STEP
      setSpeed((s) => clampSpeed(s + step))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className={styles.overlay}>
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.hud}>
        <div className={styles.controls}>
          <span>속도 {speed.toFixed(1)} (↑/↓)</span>
          <span className={styles.dot}>·</span>
          <button type="button" className={styles.exit} onClick={onExit}>
            Esc 종료
          </button>
        </div>
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
