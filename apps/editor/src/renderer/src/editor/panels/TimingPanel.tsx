import { useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import { snapTick, TimingMap } from '@rcm/core'
import { Button, Card, IconButton, NumberField, Row, useToast } from '../../ui'
import {
  addTimingPoint,
  measureBeatAt,
  removeTimingPoint,
  updateTimingPoint
} from '../commands/timing'
import { useEditor, useStore } from '../state/useStore'
import styles from './Panel.module.css'

export function TimingPanel() {
  const store = useStore()
  const toast = useToast()
  const song = useEditor((s) => s.doc.song)
  const tm = useMemo(() => new TimingMap(song.timing, song.offsetMs), [song.timing, song.offsetMs])

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

  return (
    <>
      {song.timing.map((point, i) => {
          const seg = tm.segmentAt(point.tick)
          const { measure, beat } = measureBeatAt(tm, point.tick)
          return (
            <Card key={point.tick} title={`변경 지점 ${i + 1}`}>
              <Row label="위치">
                <span className={styles.position}>
                  {measure}마디 {beat}박
                </span>
                {i > 0 && (
                  <IconButton
                    icon={Trash2}
                    label="삭제"
                    onClick={() =>
                      store.apply('BPM 삭제', removeTimingPoint(store.getState().doc, i))
                    }
                  />
                )}
              </Row>
              <Row label="BPM">
                <NumberField
                  value={seg.bpm}
                  min={1}
                  max={999}
                  step={0.1}
                  onCommit={(bpm) =>
                    store.apply('BPM 수정', updateTimingPoint(store.getState().doc, i, { bpm }))
                  }
                />
              </Row>
              <Row label="박자 수">
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
              </Row>
            </Card>
          )
        })}
      <Card>
        <Button onClick={addAtPlayhead}>현재 위치에 추가</Button>
      </Card>
    </>
  )
}
