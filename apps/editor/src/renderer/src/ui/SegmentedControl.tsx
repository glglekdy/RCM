import styles from './SegmentedControl.module.css'

interface SegmentedControlProps<T> {
  options: { value: T; label: string; disabled?: boolean }[]
  value: T
  onChange: (v: T) => void
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange
}: SegmentedControlProps<T>) {
  return (
    <div className={styles.group} role="tablist">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          disabled={o.disabled}
          className={`${styles.tab} ${o.value === value ? styles.selected : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
