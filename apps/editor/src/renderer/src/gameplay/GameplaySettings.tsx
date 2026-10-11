import { DEFAULT_LAYOUT, LAYOUT_LIMITS, layoutEquals, type NoteShape, type PlayfieldLayout } from '@rcm/playfield'
import { Button, Card, NumberField, SegmentedControl, Slider } from '../ui'
import { setLayout, useLayout } from './layoutStore'
import styles from './GameplaySettings.module.css'

type NumericKey = keyof typeof LAYOUT_LIMITS

const ROWS: { key: NumericKey; label: string; desc?: string }[] = [
  { key: 'laneWidth', label: '노트 너비' },
  { key: 'noteHeight', label: '노트 두께' },
  { key: 'judgeLineThickness', label: '판정선 두께' },
  { key: 'judgeLineFromBottom', label: '판정선 위치', desc: '화면 아래에서 판정선까지 거리' }
]

const SHAPES: { value: NoteShape; label: string }[] = [
  { value: 'bar', label: '바' },
  { value: 'circle', label: '동그라미' }
]

/** 설정 페이지의 `게임플레이` 카드. 바꾸면 미리보기·테스트 플레이에 바로 반영된다. */
export function GameplaySettings() {
  const layout = useLayout()
  const update = (patch: Partial<PlayfieldLayout>) => setLayout({ ...layout, ...patch })
  const clamp = (key: NumericKey, v: number) => {
    const { min, max } = LAYOUT_LIMITS[key]
    return Math.min(max, Math.max(min, Math.round(v)))
  }

  return (
    <Card title="게임플레이">
      <div className={styles.row}>
        <span className={styles.label}>노트 모양</span>
        <SegmentedControl options={SHAPES} value={layout.noteShape} onChange={(noteShape) => update({ noteShape })} />
      </div>
      {ROWS.map(({ key, label, desc }) => {
        const disabled = key === 'noteHeight' && layout.noteShape === 'circle'
        const { min, max } = LAYOUT_LIMITS[key]
        return (
          <div key={key} className={`${styles.row} ${disabled ? styles.disabled : ''}`}>
            <div className={styles.text}>
              <span className={styles.label}>{label}</span>
              {(disabled || desc) && (
                <span className={styles.desc}>{disabled ? '동그라미는 노트 너비를 따라가요' : desc}</span>
              )}
            </div>
            <div className={styles.control}>
              <Slider
                label={label}
                value={layout[key]}
                min={min}
                max={max}
                disabled={disabled}
                onChange={(v) => update({ [key]: clamp(key, v) })}
              />
              <NumberField
                value={layout[key]}
                min={min}
                max={max}
                suffix="px"
                onCommit={(v) => update({ [key]: clamp(key, v) })}
              />
            </div>
          </div>
        )
      })}
      <div className={styles.footer}>
        <Button
          variant="ghost"
          disabled={layoutEquals(layout, DEFAULT_LAYOUT)}
          onClick={() => setLayout({ ...DEFAULT_LAYOUT })}
        >
          기본값으로 되돌리기
        </Button>
      </div>
    </Card>
  )
}
