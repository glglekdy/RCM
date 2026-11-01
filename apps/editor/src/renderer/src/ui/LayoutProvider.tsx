import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { layoutMode, nextLayoutMode } from './layoutMode'
import type { LayoutMode } from './layoutMode'
import { caps } from './platform'

const LayoutContext = createContext<LayoutMode>('desktop')

function isTyping(): boolean {
  const el = document.activeElement
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

/** 창 크기에 맞는 화면 모드를 내려주고, CSS가 쓰도록 `<html data-layout>`에도 적는다. */
export function LayoutProvider({ children }: { children: ReactNode }) {
  const pinnedDesktop = caps().windowControls
  const [mode, setMode] = useState<LayoutMode>(() =>
    layoutMode(window.innerWidth, window.innerHeight, pinnedDesktop)
  )
  const widthRef = useRef(window.innerWidth)
  const modeRef = useRef(mode)
  modeRef.current = mode

  useLayoutEffect(() => {
    document.documentElement.dataset.layout = mode
  }, [mode])

  useEffect(() => {
    const onResize = (): void => {
      const width = window.innerWidth
      const next = nextLayoutMode(modeRef.current, widthRef.current, width, window.innerHeight, {
        pinnedDesktop,
        typing: isTyping()
      })
      widthRef.current = width
      setMode(next)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [pinnedDesktop])

  return <LayoutContext.Provider value={mode}>{children}</LayoutContext.Provider>
}

export function useLayoutMode(): LayoutMode {
  return useContext(LayoutContext)
}
