import { useEffect, useRef, useState } from 'react'
import { Cog, GripVertical, Music, Plus, Trash2 } from 'lucide-react'
import { DEFAULT_NOTE_COLOR, MAX_TRACKS, TRACK_COLOR_PATTERN, isGimmick, type Track, type TrackKind } from '@rcm/core'
import { keyLabel } from '@rcm/playfield'
import type { PresetIssues, PresetTrack } from '../../../shared/presets'
import { Button, IconButton, SegmentedControl, SortableList, TextField } from '../ui'
import styles from './TrackRowsEditor.module.css'

const TRACK_ROW_HEIGHT = 36

const KIND_OPTIONS: { value: TrackKind; label: string }[] = [
  { value: 'play', label: '플레이' },
  { value: 'gimmick', label: '기믹' }
]

type LookPatch = { color?: string; kind?: TrackKind }

type KeyField = 'key' | 'subKey'

interface TrackRowsEditorProps {
  tracks: readonly (Track | PresetTrack)[]
  /** 키 칸을 보일지 (프리셋 표만) */
  showKeys: boolean
  /** 좁은 자리(채보 탭)용: 색은 스와치만, 종류는 아이콘 토글 */
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

/** 트랙 표: 손잡이(끌어서 순서 변경), 이름, 색, 종류(플레이/기믹), [키, 보조 키], 삭제. 프리셋 페이지와 채보 탭이 함께 쓴다. */
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
          const kind: TrackKind = isGimmick(track) ? 'gimmick' : 'play'
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
                <KindToggle value={kind} onChange={(k) => onLook(i, { kind: k })} />
              ) : (
                <span className={styles.kinds}>
                  <SegmentedControl
                    options={KIND_OPTIONS}
                    value={kind}
                    onChange={(k) => {
                      if (k !== kind) onLook(i, { kind: k })
                    }}
                  />
                </span>
              )}
              {showKeys && (
                <>
                  <KeyButton
                    code={'key' in track ? track.key : null}
                    issue={issue.key}
                    gimmick={kind === 'gimmick'}
                    onKey={(code) => onKey?.(i, 'key', code)}
                  />
                  <KeyButton
                    sub
                    code={('subKey' in track ? track.subKey : null) ?? null}
                    issue={issue.subKey}
                    gimmick={kind === 'gimmick'}
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

/** 좁은 자리용 종류 토글: 음표 = 플레이, 톱니 = 기믹. 누르면 반대 종류로 바꾼다. */
function KindToggle({ value, onChange }: { value: TrackKind; onChange: (k: TrackKind) => void }) {
  const gimmick = value === 'gimmick'
  const Icon = gimmick ? Cog : Music
  return (
    <button
      type="button"
      className={`${styles.kindToggle} ${gimmick ? styles.kindGimmick : ''}`}
      aria-pressed={gimmick}
      aria-label="기믹 트랙"
      title={gimmick ? '기믹 트랙 (판정 없음) — 누르면 플레이 트랙으로' : '플레이 트랙 — 누르면 기믹 트랙으로'}
      onClick={() => onChange(gimmick ? 'play' : 'gimmick')}
    >
      <Icon size={14} />
    </button>
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
 * `gimmick`이면 키가 없는 트랙이므로 막고 `—`만 보인다.
 */
function KeyButton({
  code,
  issue,
  sub = false,
  gimmick = false,
  onKey
}: {
  code: string | null
  issue?: string
  sub?: boolean
  gimmick?: boolean
  onKey: (code: string | null) => void
}) {
  const [capturing, setCapturing] = useState(false)
  // 지정에 쓴 키의 keyup이 버튼 클릭(Space)으로 이어지지 않게 한다
  const swallowKeyUp = useRef(false)

  if (gimmick) {
    return (
      <button type="button" className={`${styles.key} ${styles.emptySub}`} disabled title="기믹 트랙은 키가 없어요">
        —
      </button>
    )
  }

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
