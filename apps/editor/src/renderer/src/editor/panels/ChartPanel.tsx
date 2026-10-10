import { useState } from 'react'
import { BookmarkPlus } from 'lucide-react'
import { keyLabel } from '@rcm/playfield'
import { resolveKeymap } from '../../../../shared/presets'
import { usePresets } from '../../presets/presetStore'
import { TrackRowsEditor } from '../../presets/TrackRowsEditor'
import { Button, Card, NumberField, Row, TextField, useDialogs, useToast } from '../../ui'
import { updateChartMeta } from '../commands/meta'
import {
  addTrack,
  moveTrack,
  notesOnTrack,
  removeTrack,
  renameTrack,
  updateTrackLook
} from '../commands/tracks'
import { getChart, type ProjectDoc } from '../state/doc'
import { useEditor, useStore } from '../state/useStore'
import { SavePresetDialog } from './SavePresetDialog'
import styles from './Panel.module.css'

export function ChartPanel() {
  const store = useStore()
  const dialogs = useDialogs()
  const toast = useToast()
  const file = useEditor((s) => s.activeChart)
  const chart = useEditor((s) => getChart(s.doc, s.activeChart))
  // 재생·녹음·테스트 플레이 중에는 트랙을 고치지 않는다
  const locked = useEditor((s) => s.playing || s.mode !== 'edit')
  const presets = usePresets()
  const keymap = resolveKeymap(chart.tracks, presets)
  const [savingPreset, setSavingPreset] = useState(false)

  const applyMeta = (patch: { name?: string; level?: number }) =>
    store.apply('채보 정보 변경', updateChartMeta(store.getState().doc, file, patch), file)

  const isLocked = () => {
    const s = store.getState()
    return s.playing || s.mode !== 'edit'
  }

  /** 트랙 편집을 기록한다. 트랙 이름·위치가 바뀌는 편집은 선택을 비운다. */
  const applyTracks = (label: string, next: ProjectDoc | null, clearSelection: boolean) => {
    if (isLocked()) return
    if (store.apply(label, next, file) && clearSelection) store.set({ selection: new Set() })
  }

  const rename = (i: number, id: string) => {
    if (isLocked()) return
    const next = renameTrack(store.getState().doc, file, i, id.trim())
    // 거부되면 입력칸은 원래 값으로 돌아간다
    if (!next) toast('이름을 바꿀 수 없어요 (형식이 틀렸거나 이미 있는 이름)')
    else applyTracks('트랙 이름 변경', next, true)
  }

  const remove = async (i: number) => {
    if (isLocked()) return
    const before = getChart(store.getState().doc, file)
    const id = before.tracks[i]?.id
    if (id === undefined) return
    const count = notesOnTrack(before, id)
    if (count > 0) {
      const ok = await dialogs.confirm({
        title: '트랙 삭제',
        message: `${count}개 노트가 함께 삭제돼요`,
        confirmLabel: '삭제',
        danger: true
      })
      if (!ok) return
    }
    // 묻는 사이에 트랙이 바뀌었을 수 있으니 같은 이름의 트랙을 지운다
    const doc = store.getState().doc
    if (!doc.charts.some((c) => c.file === file)) return
    const index = getChart(doc, file).tracks.findIndex((t) => t.id === id)
    if (index < 0) return
    applyTracks('트랙 삭제', removeTrack(doc, file, index)?.doc ?? null, true)
  }

  const sourceText =
    keymap.source.kind === 'preset'
      ? `프리셋 '${keymap.source.name}'의 키`
      : '자동 배정 (맞는 프리셋 없음)'

  return (
    <>
      <Card title="채보 정보">
        <Row label="이름">
          <TextField value={chart.name} onCommit={(name) => applyMeta({ name })} />
        </Row>
        <Row label="레벨">
          <NumberField
            value={chart.level}
            min={1}
            max={99}
            onCommit={(level) => applyMeta({ level: Math.round(level) })}
          />
        </Row>
      </Card>
      <Card title="트랙">
        <TrackRowsEditor
          tracks={chart.tracks}
          showKeys={false}
          compact
          disabled={locked}
          onRename={rename}
          onLook={(i, patch) =>
            applyTracks('트랙 모양 변경', updateTrackLook(store.getState().doc, file, i, patch), false)
          }
          onMove={(from, to) =>
            applyTracks('트랙 순서 변경', moveTrack(store.getState().doc, file, from, to), true)
          }
          onRemove={(i) => void remove(i)}
          onAdd={() => applyTracks('트랙 추가', addTrack(store.getState().doc, file), false)}
        />
        <div className={styles.trackActions}>
          <Button variant="ghost" onClick={() => setSavingPreset(true)}>
            <BookmarkPlus size={16} /> 프리셋으로 저장
          </Button>
        </div>
      </Card>
      <Card title="키 배치">
        {chart.tracks.map((t) => {
          const code = keymap.keys.get(t.id)
          return (
            <div key={t.id} className={styles.keyRow}>
              {t.id} — {code ? keyLabel(code) : '-'}
            </div>
          )
        })}
        <p className={styles.hint}>{sourceText}</p>
      </Card>
      {savingPreset && <SavePresetDialog onClose={() => setSavingPreset(false)} />}
    </>
  )
}
