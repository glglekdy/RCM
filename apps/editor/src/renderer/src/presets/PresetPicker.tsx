import { ChevronDown } from 'lucide-react'
import { DEFAULT_NOTE_COLOR, isGimmick } from '@rcm/core'
import type { TrackPreset } from '../../../shared/presets'
import { Row } from '../ui'
import styles from './PresetPicker.module.css'

interface PresetPickerProps {
  presets: readonly TrackPreset[]
  /** 고른 프리셋 id */
  value: string
  onChange: (id: string) => void
}

/** 트랙 프리셋 드롭다운과 그 아래 트랙 미리보기 (칩은 같은 너비, 테두리·글자 = 트랙 색, 기믹은 점선). */
export function PresetPicker({ presets, value, onChange }: PresetPickerProps) {
  const preset = presets.find((p) => p.id === value)
  return (
    <div className={styles.picker}>
      <Row label="트랙 프리셋">
        <div className={styles.selectWrap}>
          <select
            className={styles.select}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className={styles.chevron} />
        </div>
      </Row>
      {preset && (
        <div className={styles.chips}>
          {preset.tracks.map((t) => {
            const color = t.color ?? DEFAULT_NOTE_COLOR
            const gimmick = isGimmick(t)
            return (
              <span
                key={t.id}
                className={`${styles.chip} ${gimmick ? styles.gimmickChip : ''}`}
                style={{ borderColor: color, color }}
                title={gimmick ? `${t.id} (기믹)` : t.id}
              >
                {t.id}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
