import { useMemo } from 'react'
import { CornerDownRight, Trash2 } from 'lucide-react'
import { estimateTempo, snapTick, TimingMap } from '@rcm/core'
import { Button, Card, IconButton, NumberField, Row, TextField, useToast } from '../../ui'
import {
  addTimingPoint,
  measureBeatAt,
  removeTimingPoint,
  updateTimingPoint
} from '../commands/timing'
import { removeMarker, renameMarker } from '../commands/markers'
import { applyTapFromHere, applyTapWhole } from '../commands/tap'
import { useEditor, useStore } from '../state/useStore'
import { useFocusPoint } from './focusPoint'
import { SpeedCard } from './SpeedCard'
import styles from './Panel.module.css'

/** m:ss.mmm */
function formatMarkerTime(ms: number): string {
  const total = Math.max(0, Math.round(ms))
  const m = Math.floor(total / 60000)
  const sec = Math.floor((total % 60000) / 1000)
  const milli = total % 1000
  return `${m}:${String(sec).padStart(2, '0')}.${String(milli).padStart(3, '0')}`
}

export function TimingPanel() {
  const store = useStore()
  const toast = useToast()
  const song = useEditor((s) => s.doc.song)
  const taps = useEditor((s) => s.taps)
  const markers = useEditor((s) => s.doc.editorData.markers)
  const est = useMemo(() => estimateTempo(taps), [taps])
  const tm = useMemo(() => new TimingMap(song.timing, song.offsetMs), [song.timing, song.offsetMs])
  const bpmListRef = useFocusPoint<HTMLDivElement>('bpm')

  const addAtPlayhead = () => {
    const { playheadMs, snap, doc } = store.getState()
    const map = new TimingMap(doc.song.timing, doc.song.offsetMs)
    const tick = Math.round(snapTick(map, Math.max(0, map.msToTick(playheadMs)), snap))
    const bpm = map.segmentAt(tick).bpm
    const existing = doc.song.timing.find((t) => t.tick === tick)
    if (existing) {
      toast('이미 변경 지점이 있어요')
      return
    }
    store.apply('BPM 추가', addTimingPoint(doc, tick, bpm))
  }

  const applyTap = (whole: boolean) => {
    if (!est) return
    const { doc } = store.getState()
    const next = whole ? applyTapWhole(doc, est) : applyTapFromHere(doc, est, est.firstTapMs)
    store.apply('탭 BPM 적용', next)
    store.set({ taps: [] })
    toast('탭 BPM을 적용했어요')
  }

  return (
    <>
      <Card title="BPM">
        <div ref={bpmListRef} className={styles.pointList}>
          {song.timing.map((point, i) => {
            const seg = tm.segmentAt(point.tick)
            const { measure, beat } = measureBeatAt(tm, point.tick)
            return (
              <div key={point.tick} className={styles.point} data-tick={point.tick}>
                <div className={styles.pointRow}>
                  <span className={styles.position}>
                    {measure}마디 {beat}박
                  </span>
                  <div className={styles.trackActions}>
                    <IconButton
                      icon={CornerDownRight}
                      label="이 위치로 이동"
                      onClick={() => store.set({ playheadMs: tm.tickToMs(point.tick) })}
                    />
                    {/* 첫 지점은 곡의 기본 BPM이라 지울 수 없다 */}
                    {i > 0 && (
                      <IconButton
                        icon={Trash2}
                        label="삭제"
                        onClick={() =>
                          store.apply('BPM 삭제', removeTimingPoint(store.getState().doc, i))
                        }
                      />
                    )}
                  </div>
                </div>
                <div className={styles.pointRow}>
                  <div className={styles.pointValue}>
                    <NumberField
                      value={seg.bpm}
                      min={1}
                      max={999}
                      step={0.1}
                      suffix="BPM"
                      onCommit={(bpm) =>
                        store.apply('BPM 수정', updateTimingPoint(store.getState().doc, i, { bpm }))
                      }
                    />
                  </div>
                  <div className={styles.pointValue}>
                    <NumberField
                      value={seg.beatsPerMeasure}
                      min={1}
                      max={16}
                      suffix="박"
                      onCommit={(beatsPerMeasure) =>
                        store.apply(
                          'BPM 수정',
                          updateTimingPoint(store.getState().doc, i, { beatsPerMeasure })
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            )
          })}
          <div className={styles.buttons}>
            <Button onClick={addAtPlayhead}>현재 위치에 BPM 변경 추가</Button>
          </div>
        </div>
      </Card>
      <SpeedCard tm={tm} />
      <Card title="탭 BPM">
        {est ? (
          <>
            <Row label="BPM">
              <span className={styles.position}>{est.bpm.toFixed(2)}</span>
            </Row>
            <Row label="첫 박">
              <span className={styles.position}>{Math.round(est.firstBeatMs)}ms</span>
            </Row>
            <Row label="편차">
              <span className={styles.position}>{Math.round(est.deviationMs)}ms</span>
            </Row>
            <Row label="탭">
              <span className={styles.position}>{est.count}회</span>
            </Row>
            <div className={styles.buttons}>
              <Button variant="primary" onClick={() => applyTap(true)}>
                곡 전체에 적용
              </Button>
              <Button onClick={() => applyTap(false)}>이 지점부터 적용</Button>
            </div>
          </>
        ) : (
          <p className={styles.hint}>
            재생 중 T를 박자에 맞춰 4번 이상 눌러 주세요 ({taps.length}회)
          </p>
        )}
        <div className={styles.buttons}>
          <Button variant="ghost" disabled={taps.length === 0} onClick={() => store.set({ taps: [] })}>
            초기화
          </Button>
        </div>
      </Card>
      <Card title="가이드 마커">
        {markers.length === 0 ? (
          <p className={styles.hint}>M 키로 마커를 추가할 수 있어요</p>
        ) : (
          markers.map((m, i) => (
            <div key={`${i}-${m.ms}`} className={styles.markerRow}>
              <span className={styles.markerTime}>{formatMarkerTime(m.ms)}</span>
              <div className={styles.markerName}>
                <TextField
                  value={m.label}
                  placeholder="이름"
                  onCommit={(label) =>
                    store.apply('마커 이름 변경', renameMarker(store.getState().doc, i, label))
                  }
                />
              </div>
              <IconButton
                icon={CornerDownRight}
                label="이 위치로 이동"
                onClick={() => store.set({ playheadMs: m.ms })}
              />
              <IconButton
                icon={Trash2}
                label="삭제"
                onClick={() => store.apply('마커 삭제', removeMarker(store.getState().doc, i))}
              />
            </div>
          ))
        )}
      </Card>
    </>
  )
}
