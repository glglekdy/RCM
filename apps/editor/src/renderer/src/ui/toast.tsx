import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import styles from './toast.module.css'

const DURATION_MS = 2500

type ToastOptions = { action?: { label: string; onClick: () => void }; sticky?: boolean }
type ToastFn = (message: string, options?: ToastOptions) => void
type Item = { id: number; message: string; options?: ToastOptions }

const ToastContext = createContext<ToastFn | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Item[]>([])
  const nextId = useRef(0)

  const toast = useCallback<ToastFn>((message, options) => {
    const id = nextId.current++
    setToasts((t) => [...t, { id, message, options }])
    if (!options?.sticky) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), DURATION_MS)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className={styles.stack} aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={styles.toast}>
            {t.message}
            {t.options?.action && (
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  t.options?.action?.onClick()
                  setToasts((l) => l.filter((x) => x.id !== t.id))
                }}
              >
                {t.options.action.label}
              </button>
            )}
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
