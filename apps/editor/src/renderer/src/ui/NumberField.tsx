import { useEffect, useState } from 'react'
import styles from './NumberField.module.css'

interface NumberFieldProps {
  value: number
  onChange: (v: number) => void
  prefix?: string
  suffix?: string
  step?: number
  min?: number
  max?: number
}

export function NumberField({ value, onChange, prefix, suffix, step = 1, min, max }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(String(value))
  }, [value, focused])

  const inRange = (n: number) =>
    Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max)

  const handleChange = (text: string) => {
    setDraft(text)
    const n = text.trim() === '' ? NaN : Number(text)
    if (inRange(n)) onChange(n)
  }

  const bump = (dir: 1 | -1) => {
    const n = Number(draft)
    const base = Number.isFinite(n) ? n : value
    // 부동소수점 오차 제거
    const next = Number((base + dir * step).toFixed(10))
    if (inRange(next)) {
      setDraft(String(next))
      onChange(next)
    }
  }

  return (
    <label className={styles.chip}>
      {prefix && <span className={styles.affix}>{prefix}</span>}
      <input
        className={styles.input}
        type="text"
        inputMode="decimal"
        value={draft}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          setDraft(String(value)) // 잘못된 값이면 원래 값으로 복원
        }}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            bump(1)
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            bump(-1)
          } else if (e.key === 'Enter') {
            e.currentTarget.blur()
          }
        }}
      />
      {suffix && <span className={styles.affix}>{suffix}</span>}
    </label>
  )
}
