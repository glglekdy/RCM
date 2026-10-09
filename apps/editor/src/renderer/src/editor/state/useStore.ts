import { createContext, useContext, useSyncExternalStore } from 'react'
import type { EditorState, EditorStore } from './store'

export const StoreContext = createContext<EditorStore | null>(null)

export function useStore(): EditorStore {
  const store = useContext(StoreContext)
  if (!store) throw new Error('EditorScreen 안에서만 쓸 수 있어요')
  return store
}

export function useEditor<T>(selector: (s: EditorState) => T): T {
  const store = useStore()
  return useSyncExternalStore(store.subscribe.bind(store), () => selector(store.getState()))
}
