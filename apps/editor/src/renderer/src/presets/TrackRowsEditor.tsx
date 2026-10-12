import { useEffect, useRef, useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import {
  DEFAULT_NOTE_COLOR,
  MAX_TRACKS,
  TRACK_COLOR_PATTERN,
  type Track,
  type TrackWidth
} from '@rcm/core'
import { keyLabel } from '@rcm/playfield'
import type { PresetIssues, PresetTrack } from '../../../shared/presets'
import { Button, IconButton, SegmentedControl, SortableList, TextField } from '../ui'
import styles from './TrackRowsEditor.module.css'

const TRACK_ROW_HEIGHT = 36

const WIDTH_OPTIONS: { value: TrackWidth; label: string }[] = [
  { value: 'narrow', label: '좁게' },
  { value: 'normal', label: '보통' },
  { value: 'wide', label: '넓게' }
]

type LookPatch = { color?: string; width?: TrackWidth }

type KeyField = 'key' | 'subKey'

interface TrackRowsEditorProps {
  tracks: readonly (Track | PresetTrack)[]
  /** 키 칸을 보일지 (프리셋 표만) */
  showKeys: boolean
  /** 좁은 자리(채보 탭)용: 색은 스와치만, 폭은 작은 그림 버튼 */
  compact?: boolean
  /** 모든 입력·버튼과 끌기를 막는다 */
  disabled?: boolean
  /** 행별 규칙 위반 메시지 */
  issues?: PresetIssues['tracks']
  onRename(i: number, id: string): void
  onLook(i: number, patch: LookPatch): void
  /** 주 키(`key`)나 보조 키(`subKey`) 지정. null이면 비움 */
  onKey?(i: number, field: KeyField, code: string | null): void
  onMove(from: number, to: number): void
  onRemove(i: number): void
  onAdd(): void
}

interface RowItem {
  track: Track | PresetTrack
  /** 행 key. 이름이 겹친 동안에도 유일하도록 몇 번째 같은 이름인지 붙인다 */
  key: string
}

/** 트랙 표: 손잡이(끌어서 순서 변경), 이름, 색, 폭, [키, 보조 키], 삭제. 프리셋 페이지와 채보 탭이 함께 쓴다. */
export function TrackRowsEditor({
  tracks,
  showKeys,
  compact = false,
  disabled = false,
  issues,
  onRename,
  onLook,
  onKey,
  onMove,
  onRemove,
  onAdd
}: TrackRowsEditorProps) {
  const seen = new Map<string, number>()
  const rows: RowItem[] = tracks.map((track) => {
    const n = seen.get(track.id) ?? 0
    seen.set(track.id, n + 1)
    return { track, key: n === 0 ? track.id : `${track.id}#${n}` }
  })

  return (
    <fieldset className={`${styles.editor} ${compact ? styles.compact : ''}`} disabled={disabled}>
      <SortableList
        items={rows}
        rowHeight={TRACK_ROW_HEIGHT}
        getKey={(r) => r.key}
        onMove={onMove}
        renderRow={({ track }, i, handle) => {
          const issue = issues?.[i] ?? {}
          const color = track.color ?? DEFAULT_NOTE_COLOR
          const width = track.width ?? 'normal'
          return (
            <div className={styles.row}>
              <span
                className={styles.grip}
                onPointerDown={disabled ? undefined : handle.onPointerDown}
                title="끌어서 순서 변경"
              >
                <GripVertical size={14} />
              </span>
              <span className={`${styles.id} ${issue.id ? styles.invalid : ''}`} title={issue.id}>
                <TextField value={track.id} onCommit={(id) => onRename(i, id)} />
              </span>
              <ColorSwatch
                value={TRACK_COLOR_PATTERN.test(color) ? color.toLowerCase() : DEFAULT_NOTE_COLOR}
                onCommit={(c) => {
                  if (c !== color.toLowerCase()) onLook(i, { color: c })
                }}
              />
              {!compact && (
                <span className={`${styles.hex} ${issue.color ? styles.invalid : ''}`} title={issue.color}>
                  <TextField
                    value={color}
                    onCommit={(text) => {
                      const c = text.trim().toLowerCase()
                      // 형식이 틀리면 반영하지 않는다 (입력칸은 원래 값으로 돌아간다)
                      if (TRACK_COLOR_PATTERN.test(c) && c !== color.toLowerCase()) onLook(i, { color: c })
                    }}
                  />
                </span>
              )}
              {compact ? (
                <WidthPicker
                  value={width}
                  onChange={(w) => {
                    if (w !== width) onLook(i, { width: w })
                  }}
                />
              ) : (
                <span className={styles.widths}>
                  <SegmentedControl
                    options={WIDTH_OPTIONS}
                    value={width}
                    onChange={(w) => {
                      if (w !== width) onLook(i, { width: w })
                    }}
                  />
                </span>
              )}
              {showKeys && (
                <>
                  <KeyButton
                    code={'key' in track ? track.key : null}
                    issue={issue.key}
                    onKey={(code) => onKey?.(i, 'key', code)}
                  />
                  <KeyButton
                    sub
                    code={('subKey' in track ? track.subKey : null) ?? null}
                    issue={issue.subKey}
                    onKey={(code) => onKey?.(i, 'subKey', code)}
                  />
                </>
              )}
              <IconButton
                icon={Trash2}
                label="트랙 삭제"
                disabled={tracks.length <= 1}
                onClick={() => onRemove(i)}
              />
            </div>
          )
        }}
      />
      <div className={styles.footer}>
        <Button variant="ghost" disabled={tracks.length >= MAX_TRACKS} onClick={onAdd}>
          <Plus size={16} /> 트랙 추가
        </Button>
      </div>
    </fieldset>
  )
}

/** 좁은 자리용 폭 고르기: 폭을 막대 굵기로 보여주는 세 버튼. */
function WidthPicker({ value, onChange }: { value: TrackWidth; onChange: (w: TrackWidth) => void }) {
  return (
    <span className={styles.widthPicker} role="radiogroup" aria-label="트랙 폭">
      {WIDTH_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.label}
          title={o.label}
          className={`${styles.widthOption} ${o.value === value ? styles.widthSelected : ''}`}
          onClick={() => onChange(o.value)}
        >
          <span className={`${styles.widthBar} ${styles[o.value]}`} />
        </button>
      ))}
    </span>
  )
}

/**
 * 색 스와치. 누르면 OS 색 선택 창이 열리고, 고르는 동안은 스와치에만 보이다가
 * 창을 닫을 때(change) 한 번 반영한다.
 */
function ColorSwatch({ value, onCommit }: { value: string; onCommit: (color: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [live, setLive] = useState<string | null>(null)
  const onCommitRef = useRef(onCommit)

  useEffect(() => {
    onCommitRef.current = onCommit
  }, [onCommit])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const onChange = () => {
      setLive(null)
      onCommitRef.current(el.value.toLowerCase())
    }
    el.addEventListener('change', onChange)
    return () => el.removeEventListener('change', onChange)
  }, [])

  const shown = live ?? value
  return (
    <label className={styles.swatch} style={{ background: shown }} title="색 선택">
      <input ref={inputRef} type="color" value={shown} onChange={(e) => setLive(e.target.value)} />
    </label>
  )
}

/**
 * 키 지정 버튼: 누르면 `키를 누르세요` → 다음 키로 지정. Esc 취소, Backspace/Delete는 비움.
 * Tab은 지정하지 않고 취소한 뒤 포커스를 그대로 옮긴다. `sub`면 보조 키 칸 (비어 있으면 흐리게 `보조 키`).
 */
function KeyButton({
  code,
  issue,
  sub = false,
  onKey
}: {
  code: string | null
  issue?: string
  sub?: boolean
  onKey: (code: string | null) => void
}) {
  const [capturing, setCapturing] = useState(false)
  // 지정에 쓴 키의 keyup이 버튼 클릭(Space)으로 이어지지 않게 한다
  const swallowKeyUp = useRef(false)

  return (
    <button
      type="button"
      className={`${styles.key} ${sub && !code ? styles.emptySub : ''} ${capturing ? styles.capturing : ''} ${issue ? styles.invalidKey : ''}`}
      title={issue ?? (sub ? `보조 키: ${code ?? '없음'} (주 키와 함께 이 트랙을 쳐요)` : (code ?? '키 없음'))}
      onClick={(e) => {
        e.currentTarget.focus()
        setCapturing((c) => !c)
      }}
      onBlur={() => setCapturing(false)}
      onKeyDown={(e) => {
        if (!capturing) return
        if (e.key === 'Tab') {
          setCapturing(false)
          return
        }
        e.preventDefault()
        e.stopPropagation()
        if (e.repeat || e.code === '') return
        swallowKeyUp.current = true
        setCapturing(false)
        if (e.code === 'Escape') return
        onKey(e.code === 'Backspace' || e.code === 'Delete' ? null : e.code)
      }}
      onKeyUp={(e) => {
        if (!swallowKeyUp.current) return
        swallowKeyUp.current = false
        e.preventDefault()
      }}
    >
      {capturing ? '키를 누르세요' : code ? keyLabel(code) : sub ? '보조 키' : '없음'}
    </button>
  )
}
