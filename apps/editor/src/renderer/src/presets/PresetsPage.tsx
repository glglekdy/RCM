import { useState } from 'react'
import { CircleAlert, Copy, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { nextTrackId } from '@rcm/core'
import {
  AUTO_KEYS,
  DEFAULT_PRESETS,
  hasPresetErrors,
  newPresetId,
  presetErrors,
  presetTrackKeys,
  shadowingPreset,
  type PresetTrack,
  type TrackPreset
} from '../../../shared/presets'
import { Button, TextField, useDialogs } from '../ui'
import { stagger } from '../ui/motion'
import { moveIndex } from '../ui/reorder'
import { NewPresetDialog } from './NewPresetDialog'
import { getPresets, savePresets, usePresets } from './presetStore'
import { TrackRowsEditor } from './TrackRowsEditor'
import styles from './PresetsPage.module.css'

function copyPreset(p: TrackPreset): TrackPreset {
  return { id: p.id, name: p.name, tracks: p.tracks.map((t) => ({ ...t })) }
}

function withTrack(p: TrackPreset, i: number, patch: Partial<PresetTrack>): TrackPreset {
  return { ...p, tracks: p.tracks.map((t, j) => (j === i ? { ...t, ...patch } : t)) }
}

/** 시작 화면의 `트랙 프리셋` 페이지 (트랙 스펙 2.3). 편집은 바로 설정 파일에 저장한다. */
export function PresetsPage() {
  const dialogs = useDialogs()
  const presets = usePresets()
  const [selectedId, setSelectedId] = useState(() => presets[0].id)
  /** 규칙 위반이 있어 저장하지 않은 편집 (프리셋 id → 화면에 보일 값). 이 화면을 떠나면 버린다 */
  const [drafts, setDrafts] = useState<ReadonlyMap<string, TrackPreset>>(() => new Map())
  /** `새 프리셋` 템플릿 창이 열려 있는지 */
  const [creating, setCreating] = useState(false)

  const shownOf = (p: TrackPreset): TrackPreset => drafts.get(p.id) ?? p
  const stored = presets.find((p) => p.id === selectedId) ?? presets[0]
  const shown = shownOf(stored)
  const issues = presetErrors(shown)
  const invalid = hasPresetErrors(issues)
  /** 트랙 구성이 같은 앞 프리셋. 있으면 녹음·플레이에는 그 프리셋의 키가 쓰인다 (트랙 스펙 3.4) */
  const shadow = shadowingPreset(presets, presets.indexOf(stored))

  const save = async (next: TrackPreset[]) => {
    try {
      await savePresets(next)
    } catch (err) {
      await dialogs.alert('프리셋을 저장하지 못했어요', err instanceof Error ? err.message : String(err))
    }
  }

  const setDraft = (id: string, draft: TrackPreset | null) =>
    setDrafts((d) => {
      if (draft === null && !d.has(id)) return d
      const m = new Map(d)
      if (draft) m.set(id, draft)
      else m.delete(id)
      return m
    })

  /** 선택한 프리셋 편집: 규칙에 맞으면 저장, 아니면 화면에만 반영 */
  const edit = (change: (p: TrackPreset) => TrackPreset) => {
    const next = change(shown)
    if (hasPresetErrors(presetErrors(next))) {
      setDraft(next.id, next)
      return
    }
    setDraft(next.id, null)
    void save(getPresets().map((p) => (p.id === next.id ? next : p)))
  }

  /** 템플릿 창에서 고른 프리셋을 목록 끝에 추가하고 고른다 */
  const addPreset = (p: TrackPreset) => {
    setCreating(false)
    setSelectedId(p.id)
    void save([...getPresets(), p])
  }

  const duplicate = () => {
    const list = getPresets()
    const i = list.findIndex((p) => p.id === stored.id)
    const copy: TrackPreset = { ...copyPreset(stored), id: newPresetId(list), name: `${stored.name} 복사본` }
    setSelectedId(copy.id)
    void save([...list.slice(0, i + 1), copy, ...list.slice(i + 1)])
  }

  const remove = async () => {
    const target = stored
    const ok = await dialogs.confirm({
      title: '프리셋 삭제',
      message: `'${shownOf(target).name}' 프리셋을 삭제할까요?`,
      confirmLabel: '삭제',
      danger: true
    })
    const list = getPresets()
    const i = list.findIndex((p) => p.id === target.id)
    if (!ok || i < 0 || list.length <= 1) return
    const next = list.filter((p) => p.id !== target.id)
    setDraft(target.id, null)
    setSelectedId(next[Math.min(i, next.length - 1)].id)
    await save(next)
  }

  const restoreDefaults = async () => {
    const ok = await dialogs.confirm({
      title: '기본값 복원',
      message: '모든 프리셋을 기본 프리셋으로 되돌릴까요? 직접 만들거나 고친 프리셋은 사라져요.',
      confirmLabel: '복원',
      danger: true
    })
    if (!ok) return
    const next = DEFAULT_PRESETS.map(copyPreset)
    setDrafts(new Map())
    setSelectedId(next[0].id)
    await save(next)
  }

  const addTrack = () =>
    edit((p) => {
      const used = new Set(p.tracks.flatMap(presetTrackKeys))
      const key = AUTO_KEYS.find((k) => !used.has(k)) ?? null
      return { ...p, tracks: [...p.tracks, { id: nextTrackId(p.tracks), key }] }
    })

  return (
    <div className={`${styles.page} stagger-children`}>
      <h1 className={styles.title}>트랙 프리셋</h1>
      <div className={styles.body}>
        <aside className={styles.side}>
          <div className={styles.list}>
            {presets.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className={`${styles.item} ${p.id === stored.id ? styles.selected : ''} enter-drop`}
                style={stagger(i)}
                aria-current={p.id === stored.id}
                onClick={() => setSelectedId(p.id)}
              >
                <span className={styles.itemName}>{shownOf(p).name || '(이름 없음)'}</span>
                {drafts.has(p.id) && <CircleAlert size={14} className={styles.itemAlert} />}
              </button>
            ))}
          </div>
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => setCreating(true)}>
              <Plus size={16} /> 새 프리셋
            </Button>
            <Button variant="ghost" onClick={duplicate}>
              <Copy size={16} /> 복제
            </Button>
            <Button variant="ghost" disabled={presets.length <= 1} onClick={() => void remove()}>
              <Trash2 size={16} /> 삭제
            </Button>
            <Button variant="ghost" onClick={() => void restoreDefaults()}>
              <RotateCcw size={16} /> 기본값 복원
            </Button>
          </div>
        </aside>
        <section className={styles.detail}>
          <div className={styles.nameRow}>
            <span className={styles.label}>이름</span>
            <span className={`${styles.name} ${issues.name ? styles.invalid : ''}`} title={issues.name}>
              <TextField value={shown.name} onCommit={(name) => edit((p) => ({ ...p, name: name.trim() }))} />
            </span>
          </div>
          {shadow && (
            <div className={styles.notice}>
              <CircleAlert size={14} />
              <span>
                트랙 구성이 같은 '{shadow.name}'이 먼저 있어서 녹음·플레이에는 그 프리셋의 키가 쓰여요
              </span>
            </div>
          )}
          {invalid && (
            <div className={styles.notice}>
              <CircleAlert size={14} />
              <span>
                빨간 칸을 고치기 전까지 이 프리셋은 저장되지 않아요. 고치지 않고 이 화면을 떠나면 이
                프리셋의 변경은 버려져요.
                {issues.count ? ` (${issues.count})` : ''}
              </span>
            </div>
          )}
          <TrackRowsEditor
            // 다른 프리셋을 고르면 트랙 줄이 다시 차례로 나온다
            key={stored.id}
            animateRows
            tracks={shown.tracks}
            showKeys
            issues={issues.tracks}
            onRename={(i, id) => edit((p) => withTrack(p, i, { id: id.trim() }))}
            onLook={(i, patch) =>
              // 기믹 트랙은 키가 없으므로 기믹으로 바꾸면 키를 비운다
              edit((p) => withTrack(p, i, patch.kind === 'gimmick' ? { ...patch, key: null, subKey: undefined } : patch))
            }
            onKey={(i, field, code) => edit((p) => withTrack(p, i, { [field]: code }))}
            onMove={(from, to) => edit((p) => ({ ...p, tracks: moveIndex(p.tracks, from, to) }))}
            onRemove={(i) => edit((p) => ({ ...p, tracks: p.tracks.filter((_, j) => j !== i) }))}
            onAdd={addTrack}
          />
        </section>
      </div>
      <NewPresetDialog open={creating} onClose={() => setCreating(false)} onCreate={addPreset} />
    </div>
  )
}
