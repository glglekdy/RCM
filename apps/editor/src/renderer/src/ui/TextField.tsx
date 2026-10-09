import { useEffect, useState } from 'react'
import styles from './TextField.module.css'

interface TextFieldProps {
  value: string
  /** 입력할 때마다(글자마다) 호출 */
  onChange?: (v: string) => void
  /** blur·Enter 때 최종 값으로 호출 (값이 바뀐 경우만) */
  onCommit?: (v: string) => void
  placeholder?: string
}

export function TextField({ value, onChange, onCommit, placeholder }: TextFieldProps) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(value)
  }, [value, focused])

  return (
    <input
      className={styles.input}
      type="text"
      value={draft}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        if (draft !== value) onCommit?.(draft)
        setDraft(value) // 거부되면 원래 값으로 복원, 받아들여지면 value가 곧 갱신된다
      }}
      onChange={(e) => {
        setDraft(e.target.value)
        onChange?.(e.target.value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}
