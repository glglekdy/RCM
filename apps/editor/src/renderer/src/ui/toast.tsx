import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import styles from './toast.module.css'

const DURATION_MS = 2500

type ToastFn = (message: string) => void

const ToastContext = createContext<ToastFn | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([])
  const nextId = useRef(0)

  const toast = useCallback<ToastFn>((message) => {
    const id = nextId.current++
    setToasts((t) => [...t, { id, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), DURATION_MS)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className={styles.stack} aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={styles.toast}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
