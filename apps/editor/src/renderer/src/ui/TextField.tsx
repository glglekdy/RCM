import { useEffect, useState } from 'react'
import { commitDraft, editDraft, initDraft, syncDraft } from './fieldDraft'
import { isSubmitEnter } from './keys'
import styles from './TextField.module.css'

interface TextFieldProps {
  value: string
  /** 입력할 때마다(글자마다) 호출 */
  onChange?: (v: string) => void
  /** blur·Enter 때 최종 값으로 호출 (사용자가 고쳐서 값이 바뀐 경우만) */
  onCommit?: (v: string) => void
  placeholder?: string
}

const identity = (t: string) => t

export function TextField({ value, onChange, onCommit, placeholder }: TextFieldProps) {
  const [draft, setDraft] = useState(() => initDraft(value))

  // 바깥 값이 바뀌면(Undo 등) 사용자가 고치는 중이 아닐 때만 새 값을 보여준다
  useEffect(() => {
    setDraft((d) => syncDraft(d, value))
  }, [value])

  return (
    <input
      className={styles.input}
      type="text"
      value={draft.text}
      placeholder={placeholder}
      onBlur={() => {
        const { next, commit } = commitDraft(draft, value, identity, identity)
        setDraft(next) // 거부되면 원래 값으로 복원, 받아들여지면 value가 곧 갱신된다
        if (commit !== null) onCommit?.(commit)
      }}
      onChange={(e) => {
        setDraft(editDraft(e.target.value))
        onChange?.(e.target.value)
      }}
      onKeyDown={(e) => {
        if (isSubmitEnter(e)) e.currentTarget.blur()
      }}
    />
  )
}
