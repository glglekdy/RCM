import { useEffect, useRef, useState } from 'react'
import { MAX_GIMMICK_NAME_LENGTH, MAX_GIMMICKS, type FreeChart, type FreeGimmick } from '@rcm/core'
import { ChevronDown, List, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, IconButton, isSubmitEnter, Modal, Row, TextField, useDialogs } from '../../ui'
import {
  addGimmick,
  GIMMICK_COLORS,
  gimmickError,
  gimmickNoteCount,
  nextGimmickColor,
  removeGimmick,
  updateGimmick
} from '../commands/freeNotes'
import { useEditor, useStore } from '../state/useStore'
import toolbar from './BottomToolbar.module.css'
import styles from './GimmickList.module.css'

/** 고치는 중인 기믹 종류: null이면 새로 추가 */
type Editing = { name: string | null; draft: FreeGimmick }

/**
 * 하단 툴바의 기믹 노트 목록. 누르면 위로 펼쳐지고, 고른 종류로 그린다.
 * 사용자가 이름·색을 정해 추가하고, 줄마다 연필(고치기)·휴지통(지우기)으로 관리한다.
 */
export function GimmickList({ chart }: { chart: FreeChart }) {
  const store = useStore()
  const dialogs = useDialogs()
  const file = useEditor((s) => s.activeChart)
  const tool = useEditor((s) => s.tool)
  const freeType = useEditor((s) => s.freeType)
  const freeGimmick = useEditor((s) => s.freeGimmick)
  const locked = useEditor((s) => s.playing || s.mode !== 'edit')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Editing | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const gimmicks = chart.gimmicks ?? []
  const active = freeType === 'gimmick' ? gimmicks.find((g) => g.name === freeGimmick) : undefined

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 목록을 닫는 Esc는 편집기 단축키로 넘기지 않는다
      e.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  /** 이 종류로 그린다 (연속 그리기 중이면 그대로, 지우기·선택 중이면 그리기로) */
  const pick = (name: string) => {
    store.set({ freeType: 'gimmick', freeGimmick: name, tool: tool === 'brush' ? 'brush' : 'draw' })
    setOpen(false)
  }

  const startAdd = () => {
    setOpen(false)
    setEditing({ name: null, draft: { name: '', color: nextGimmickColor(chart) } })
  }

  const startEdit = (g: FreeGimmick) => {
    setOpen(false)
    setEditing({ name: g.name, draft: { ...g } })
  }

  const save = () => {
    if (!editing || locked) return
    const doc = store.getState().doc
    const { name, draft } = editing
    if (name === null) {
      if (!store.apply('기믹 노트 추가', addGimmick(doc, file, draft), file)) return
      pick(draft.name.trim())
    } else {
      const next = updateGimmick(doc, file, name, draft)
      // 바뀐 게 없으면 그냥 닫는다
      if (next && !store.apply('기믹 노트 변경', next, file)) return
      if (next && store.getState().freeGimmick === name) store.set({ freeGimmick: draft.name.trim() })
    }
    setEditing(null)
  }

  const remove = async (g: FreeGimmick) => {
    if (locked) return
    setOpen(false)
    const count = gimmickNoteCount(chart, g.name)
    if (count > 0) {
      const ok = await dialogs.confirm({
        title: '기믹 노트 삭제',
        message: `'${g.name}' 노트 ${count}개도 함께 지워져요.`,
        confirmLabel: '삭제',
        danger: true
      })
      if (!ok) return
    }
    if (!store.apply('기믹 노트 삭제', removeGimmick(store.getState().doc, file, g.name), file)) return
    const s = store.getState()
    if (s.freeType === 'gimmick' && s.freeGimmick === g.name) store.set({ freeType: 'tap', freeGimmick: null })
  }

  const error = editing ? gimmickError(chart, editing.draft, editing.name ?? undefined) : null

  return (
    <div className={styles.root} ref={ref}>
      <button
        type="button"
        className={`${toolbar.tab} ${active ? toolbar.selected : ''}`}
        title="기믹 노트 — 판정 없이 게임이 해석하는 노트"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {active ? (
          <>
            <span className={toolbar.typeDot} style={{ background: active.color }} />
            <span className={styles.activeName}>{active.name}</span>
          </>
        ) : (
          <List size={16} />
        )}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className={styles.popup} role="dialog" aria-label="기믹 노트">
          <div className={styles.title}>기믹 노트</div>
          {gimmicks.length === 0 ? (
            <p className={styles.empty}>
              아직 없어요. 판정 없이 게임이 해석하는 노트(장애물, 연출 등)를 이름과 색을 정해 만들 수 있어요.
            </p>
          ) : (
            <ul className={styles.list}>
              {gimmicks.map((g) => (
                <li key={g.name} className={`${styles.row} ${active?.name === g.name ? styles.rowActive : ''}`}>
                  <button type="button" className={styles.pick} title={`${g.name} 그리기`} onClick={() => pick(g.name)}>
                    <span className={toolbar.typeDot} style={{ background: g.color }} />
                    <span className={styles.name}>{g.name}</span>
                    <span className={styles.count}>{gimmickNoteCount(chart, g.name)}</span>
                  </button>
                  <IconButton icon={Pencil} label="이름·색 고치기" disabled={locked} onClick={() => startEdit(g)} />
                  <IconButton icon={Trash2} label="삭제" disabled={locked} onClick={() => void remove(g)} />
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className={styles.add}
            disabled={locked || gimmicks.length >= MAX_GIMMICKS}
            onClick={startAdd}
          >
            <Plus size={14} />
            기믹 노트 추가하기
          </button>
        </div>
      )}
      {editing && (
        <Modal
          open
          title={editing.name === null ? '기믹 노트 추가' : '기믹 노트 고치기'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button onClick={() => setEditing(null)}>취소</Button>
              <Button variant="primary" disabled={error !== null || locked} onClick={save}>
                {editing.name === null ? '추가' : '저장'}
              </Button>
            </>
          }
        >
          <div
            className={styles.form}
            onKeyDown={(e) => {
              if (isSubmitEnter(e) && e.target instanceof HTMLInputElement && e.target.type === 'text' && !error) save()
            }}
          >
            <Row label="이름">
              <TextField
                value={editing.draft.name}
                placeholder="폭탄"
                onChange={(name) =>
                  setEditing({ ...editing, draft: { ...editing.draft, name: name.slice(0, MAX_GIMMICK_NAME_LENGTH) } })
                }
              />
            </Row>
            <Row label="색">
              <div className={styles.colors}>
                {GIMMICK_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`${styles.swatch} ${editing.draft.color === c ? styles.swatchOn : ''}`}
                    style={{ background: c }}
                    title={c}
                    aria-label={c}
                    aria-pressed={editing.draft.color === c}
                    onClick={() => setEditing({ ...editing, draft: { ...editing.draft, color: c } })}
                  />
                ))}
                <label
                  className={`${styles.swatch} ${styles.custom} ${GIMMICK_COLORS.includes(editing.draft.color) ? '' : styles.swatchOn}`}
                  style={GIMMICK_COLORS.includes(editing.draft.color) ? undefined : { background: editing.draft.color }}
                  title="직접 고르기"
                >
                  <input
                    type="color"
                    value={editing.draft.color}
                    onChange={(e) =>
                      setEditing({ ...editing, draft: { ...editing.draft, color: e.target.value.toLowerCase() } })
                    }
                  />
                </label>
              </div>
            </Row>
            {error && editing.draft.name.trim() !== '' && <p className={styles.error}>{error}</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}
