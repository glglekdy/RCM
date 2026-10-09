import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'
import styles from './dialogs.module.css'

interface Choice<T extends string> {
  value: T
  label: string
  variant?: 'primary' | 'default' | 'danger'
}

interface DialogApi {
  alert(title: string, message: string | string[]): Promise<void>
  confirm(opts: {
    title: string
    message: string
    confirmLabel?: string
    danger?: boolean
  }): Promise<boolean>
  choose<T extends string>(opts: {
    title: string
    message: string
    choices: Choice<T>[]
  }): Promise<T | null>
}

interface Pending {
  title: string
  message: string | string[]
  choices: Choice<string>[]
  /** Esc / 덮개 클릭 시 해결할 값 */
  cancelValue: string | null
  resolve: (value: string | null) => void
}

const DialogContext = createContext<DialogApi | null>(null)

export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Pending[]>([])

  const push = useCallback(
    (item: Omit<Pending, 'resolve'>) =>
      new Promise<string | null>((resolve) => {
        setQueue((q) => [...q, { ...item, resolve }])
      }),
    []
  )

  const api = useMemo<DialogApi>(
    () => ({
      alert: async (title, message) => {
        await push({
          title,
          message,
          choices: [{ value: 'ok', label: '확인', variant: 'primary' }],
          cancelValue: null
        })
      },
      confirm: async ({ title, message, confirmLabel, danger }) => {
        const r = await push({
          title,
          message,
          choices: [
            { value: 'cancel', label: '취소' },
            { value: 'ok', label: confirmLabel ?? '확인', variant: danger ? 'danger' : 'primary' }
          ],
          cancelValue: 'cancel'
        })
        return r === 'ok'
      },
      choose: async <T extends string>({
        title,
        message,
        choices
      }: {
        title: string
        message: string
        choices: Choice<T>[]
      }) => (await push({ title, message, choices, cancelValue: null })) as T | null
    }),
    [push]
  )

  const current = queue[0]
  const settle = (value: string | null) => {
    current.resolve(value)
    setQueue((q) => q.slice(1))
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current && (
        <Modal
          open
          title={current.title}
          onClose={() => settle(current.cancelValue)}
          footer={current.choices.map((c) => (
            <Button key={c.value} variant={c.variant} onClick={() => settle(c.value)}>
              {c.label}
            </Button>
          ))}
        >
          {Array.isArray(current.message) ? (
            <ul className={styles.list}>
              {current.message.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          ) : (
            <p className={styles.text}>{current.message}</p>
          )}
        </Modal>
      )}
    </DialogContext.Provider>
  )
}

export function useDialogs(): DialogApi {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialogs must be used inside DialogProvider')
  return ctx
}
