import styles from './TextField.module.css'

interface TextFieldProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

export function TextField({ value, onChange, placeholder }: TextFieldProps) {
  return (
    <input
      className={styles.input}
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
