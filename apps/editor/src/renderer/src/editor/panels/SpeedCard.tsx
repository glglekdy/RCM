import { Trash2 } from 'lucide-react'
import { snapTick, type SpeedEase, type TimingMap } from '@rcm/core'
import { Button, Card, IconButton, NumberField, SegmentedControl, useToast } from '../../ui'
import {
  addSpeedPoint,
  defaultSpeedAt,
  removeSpeedPoint,
  updateSpeedPoint
} from '../commands/speeds'
import { measureBeatAt } from '../commands/timing'
import { getChart, type ProjectDoc } from '../state/doc'
import { useEditor, useStore } from '../state/useStore'
import styles from './Panel.module.css'

const EASE_OPTIONS: { value: SpeedEase; label: string }[] = [
  { value: 'instant', label: '즉시' },
  { value: 'linear', label: '서서히' }
]

/** 활성 난이도의 노트 속도(변속) 지점 목록. */
export function SpeedCard({ tm }: { tm: TimingMap }) {
  const store = useStore()
  const toast = useToast()
  const file = useEditor((s) => s.activeChart)
  const chart = useEditor((s) => getChart(s.doc, s.activeChart))
  // 재생·녹음·테스트 플레이 중에는 고치지 않는다
  const locked = useEditor((s) => s.playing || s.mode !== 'edit')
  const speeds = chart.speeds ?? []

  const isLocked = () => {
    const s = store.getState()
    return s.playing || s.mode !== 'edit'
  }

  /** 지점은 tick으로 찾는다 (그 사이에 목록이 바뀌었을 수 있다). */
  const edit = (
    label: string,
    tick: number,
    make: (doc: ProjectDoc, index: number) => ProjectDoc | null
  ) => {
    if (isLocked()) return
    const doc = store.getState().doc
    const index = (getChart(doc, file).speeds ?? []).findIndex((p) => p.tick === tick)
    if (index < 0) return
    store.apply(label, make(doc, index), file)
  }

  const addAtPlayhead = () => {
    if (isLocked()) return
    const { playheadMs, snap, doc, activeChart } = store.getState()
    const tick = Math.round(snapTick(tm, Math.max(0, tm.msToTick(playheadMs)), snap))
    const target = getChart(doc, activeChart)
    if (target.speeds?.some((p) => p.tick === tick)) {
      toast('이미 이 위치에 속도 변경이 있어요')
      return
    }
    const speed = defaultSpeedAt(target, tm, tick)
    store.apply('속도 추가', addSpeedPoint(doc, activeChart, tick, speed), activeChart)
  }

  return (
    <Card title={`노트 속도 — ${chart.name}`}>
      <fieldset className={styles.speedList} disabled={locked}>
        {speeds.length === 0 ? (
          <p className={styles.hint}>변속 없음 (×1)</p>
        ) : (
          speeds.map((point) => {
            const { measure, beat } = measureBeatAt(tm, point.tick)
            return (
              <div key={point.tick} className={styles.speedRow}>
                <span className={`${styles.position} ${styles.speedPosition}`}>
                  {measure}:{beat}
                </span>
                <div className={styles.speedValue}>
                  <NumberField
                    value={point.speed}
                    min={0}
                    max={20}
                    step={0.1}
                    suffix="×"
                    onCommit={(speed) =>
                      edit('속도 수정', point.tick, (doc, i) => updateSpeedPoint(doc, file, i, { speed }))
                    }
                  />
                </div>
                <div className={styles.speedEase}>
                  <SegmentedControl
                    options={EASE_OPTIONS}
                    value={point.ease ?? 'instant'}
                    onChange={(ease) =>
                      edit('속도 수정', point.tick, (doc, i) => updateSpeedPoint(doc, file, i, { ease }))
                    }
                  />
                </div>
                <IconButton
                  icon={Trash2}
                  label="삭제"
                  onClick={() => edit('속도 삭제', point.tick, (doc, i) => removeSpeedPoint(doc, file, i))}
                />
              </div>
            )
          })
        )}
        <div className={styles.buttons}>
          <Button onClick={addAtPlayhead}>현재 위치에 추가</Button>
        </div>
      </fieldset>
    </Card>
  )
}
