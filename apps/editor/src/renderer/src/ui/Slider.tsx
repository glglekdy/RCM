import styles from './Slider.module.css'

interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  label: string
  disabled?: boolean
}

export function Slider({ value, min, max, step = 1, onChange, label, disabled }: SliderProps) {
  return (
    <input
      type="range"
      className={styles.slider}
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}
