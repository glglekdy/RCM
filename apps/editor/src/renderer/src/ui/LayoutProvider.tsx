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

/**
 * 입력 칸에 커서가 있으면 포커스를 푼다. 화면 모드가 바뀌면 그 칸이 있는 틀이 사라지는데,
 * 사라지는 칸에는 blur가 오지 않는 브라우저(Safari · Firefox)가 있어 쓰던 값이 저장되지 않기 때문이다.
 * 틀이 아직 있을 때 풀어야 칸의 '입력 끝' 처리(blur/Enter 때 값 확정)가 돈다.
 */
function blurTyping(): void {
  const el = document.activeElement
  if (el instanceof HTMLElement && isTyping()) el.blur()
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
      // 모드가 바뀌면 틀이 바뀌므로, 새 틀을 그리기 전에 입력 중이던 칸을 확정시킨다
      if (next !== modeRef.current) blurTyping()
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
