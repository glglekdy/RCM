import { useEffect, useState } from 'react'
import { commitDraft, editDraft, initDraft, parseNumber, syncDraft } from './fieldDraft'
import { isSubmitEnter } from './keys'
import styles from './NumberField.module.css'

interface NumberFieldProps {
  value: number
  /** 유효한 값이 입력될 때마다(글자마다) 호출 */
  onChange?: (v: number) => void
  /** blur·Enter·방향키 증감 때 최종 값으로 호출 (값이 바뀐 경우만) */
  onCommit?: (v: number) => void
  prefix?: string
  suffix?: string
  step?: number
  min?: number
  max?: number
}

export function NumberField({ value, onChange, onCommit, prefix, suffix, step = 1, min, max }: NumberFieldProps) {
  const [draft, setDraft] = useState(() => initDraft(String(value)))

  // 바깥 값이 바뀌면(Undo 등) 사용자가 고치는 중이 아닐 때만 새 값을 보여준다
  useEffect(() => {
    setDraft((d) => syncDraft(d, String(value)))
  }, [value])

  const parse = (text: string) => parseNumber(text, min, max)

  const handleChange = (text: string) => {
    setDraft(editDraft(text))
    const n = parse(text)
    if (n !== null) onChange?.(n)
  }

  const bump = (dir: 1 | -1) => {
    const n = Number(draft.text)
    const base = Number.isFinite(n) ? n : value
    // 부동소수점 오차 제거
    const next = Number((base + dir * step).toFixed(10))
    if (parse(String(next)) !== null) {
      setDraft(initDraft(String(next)))
      onChange?.(next)
      onCommit?.(next)
    }
  }

  return (
    <label className={styles.chip}>
      {prefix && <span className={styles.affix}>{prefix}</span>}
      <input
        className={styles.input}
        type="text"
        inputMode="decimal"
        value={draft.text}
        onBlur={() => {
          const { next, commit } = commitDraft(draft, value, parse, String)
          setDraft(next) // 잘못된 값이면 원래 값으로 복원
          if (commit !== null) onCommit?.(commit)
        }}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            bump(1)
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            bump(-1)
          } else if (isSubmitEnter(e)) {
            e.currentTarget.blur()
          }
        }}
      />
      {suffix && <span className={styles.affix}>{suffix}</span>}
    </label>
  )
}
