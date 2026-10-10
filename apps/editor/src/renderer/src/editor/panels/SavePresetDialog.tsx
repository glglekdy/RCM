import { useState } from 'react'
import { newPresetId, resolveKeymap, type TrackPreset } from '../../../../shared/presets'
import { getPresets, savePresets } from '../../presets/presetStore'
import { Button, isSubmitEnter, Modal, Row, TextField, useDialogs, useToast } from '../../ui'
import { getChart } from '../state/doc'
import { useStore } from '../state/useStore'
import styles from './Panel.module.css'

/** `프리셋으로 저장`: 지금 채보의 트랙과 지금 키 배치(3.4절)로 새 프리셋을 만든다. */
export function SavePresetDialog({ onClose }: { onClose: () => void }) {
  const store = useStore()
  const dialogs = useDialogs()
  const toast = useToast()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const trimmed = name.trim()

  const save = async () => {
    if (trimmed === '' || saving) return
    const s = store.getState()
    const { tracks } = getChart(s.doc, s.activeChart)
    const presets = getPresets()
    const { keys } = resolveKeymap(tracks, presets)
    const preset: TrackPreset = {
      id: newPresetId(presets),
      name: trimmed,
      tracks: tracks.map((t) => ({ ...t, key: keys.get(t.id) ?? null }))
    }
    setSaving(true)
    try {
      await savePresets([...presets, preset])
    } catch (err) {
      onClose()
      await dialogs.alert('프리셋을 저장하지 못했어요', err instanceof Error ? err.message : String(err))
      return
    }
    toast(`프리셋 '${trimmed}'을 저장했어요`)
    onClose()
  }

  return (
    <Modal
      open
      title="프리셋으로 저장"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={trimmed === '' || saving} onClick={() => void save()}>
            저장
          </Button>
        </>
      }
    >
      <div
        className={styles.dialogForm}
        onKeyDown={(e) => {
          // 한글 조합을 끝내는 Enter는 저장하지 않는다
          if (isSubmitEnter(e) && e.target instanceof HTMLInputElement) void save()
        }}
      >
        <Row label="이름">
          <TextField value={name} onChange={setName} placeholder="내 프리셋" />
        </Row>
      </div>
    </Modal>
  )
}
