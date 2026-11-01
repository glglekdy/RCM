import { useState } from 'react'
import { DEFAULT_COLUMNS, MAX_COLUMNS, MIN_COLUMNS, type FlickMode } from '@rcm/core'
import { Button, isSubmitEnter, Modal, NumberField, Row, SegmentedControl, TextField } from '../../ui'
import { presetToChartTracks } from '../../../../shared/presets'
import { PresetPicker } from '../../presets/PresetPicker'
import { defaultPresetId, setLastPresetId, usePresets } from '../../presets/presetStore'
import { addChart, addFreeChart } from '../commands/charts'
import { DEFAULT_FLICK_MODE } from '../commands/freeNotes'
import { FLICK_MODE_OPTIONS } from '../panels/freeLabels'
import { useStore } from '../state/useStore'
import styles from './BottomToolbar.module.css'

interface AddChartDialogProps {
  onClose: () => void
  onAdded: (file: string) => void
}

/** 난이도 추가: 이름과 트랙 프리셋을 받아 새 채보를 만든다. */
export function AddChartDialog({ onClose, onAdded }: AddChartDialogProps) {
  const store = useStore()
  const [name, setName] = useState('')
  const [layout, setLayout] = useState<'lanes' | 'free'>('lanes')
  const [columns, setColumns] = useState(DEFAULT_COLUMNS)
  const [flickMode, setFlickMode] = useState<FlickMode>(DEFAULT_FLICK_MODE)
  const presets = usePresets()
  const [presetId, setPresetId] = useState(() => defaultPresetId(presets))
  const chosenId = presets.some((p) => p.id === presetId) ? presetId : defaultPresetId(presets)

  const add = () => {
    if (layout === 'free') {
      const added = addFreeChart(store.getState().doc, name, columns, flickMode)
      if (!added) return
      store.apply('난이도 추가', added.doc)
      onAdded(added.file)
      return
    }
    const preset = presets.find((p) => p.id === chosenId)
    if (!preset) return
    const added = addChart(store.getState().doc, name, presetToChartTracks(preset))
    if (!added) return
    store.apply('난이도 추가', added.doc)
    void setLastPresetId(preset.id).catch(() => {
      // 마지막 선택을 기억하지 못해도 난이도는 추가됐다
    })
    onAdded(added.file)
  }

  return (
    <Modal
      open
      title="난이도 추가"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={name.trim() === ''} onClick={add}>
            추가
          </Button>
        </>
      }
    >
      <div
        className={styles.addForm}
        onKeyDown={(e) => {
          // 이름 칸에서 Enter = 추가 (프리셋 목록의 Enter는 그 목록을 여는 것)
          if (isSubmitEnter(e) && e.target instanceof HTMLInputElement) add()
        }}
      >
        <Row label="이름">
          <TextField value={name} onChange={setName} placeholder="HARD" />
        </Row>
        <Row label="방식">
          <SegmentedControl
            options={[
              { value: 'lanes' as const, label: '레인형' },
              { value: 'free' as const, label: '자유형 (모바일) (베타)' }
            ]}
            value={layout}
            onChange={setLayout}
          />
        </Row>
        {layout === 'lanes' ? (
          <PresetPicker presets={presets} value={chosenId} onChange={setPresetId} />
        ) : (
          <>
            <Row label="칸 수">
              <NumberField
                value={columns}
                min={MIN_COLUMNS}
                max={MAX_COLUMNS}
                onChange={(v) => setColumns(Math.round(v))}
                onCommit={(v) => setColumns(Math.round(v))}
              />
            </Row>
            <Row label="플릭">
              <SegmentedControl options={FLICK_MODE_OPTIONS} value={flickMode} onChange={setFlickMode} />
            </Row>
          </>
        )}
      </div>
    </Modal>
  )
}
