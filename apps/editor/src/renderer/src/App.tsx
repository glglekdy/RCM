import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectFiles } from '../../shared/api'
import { EditorScreen } from './editor/EditorScreen'
import { HomeScreen } from './home/HomeScreen'
import { loadPresets } from './presets/presetStore'
import { DialogProvider, TitleBar, ToastProvider } from './ui'
import { UpdateNotice } from './update/UpdateNotice'
import { startUpdateStore } from './update/updateStore'

/** `id`는 같은 폴더를 다시 열어도 편집 화면을 새로 만들기 위한 값이다. */
type Screen = { screen: 'home' } | { screen: 'editor'; files: ProjectFiles; id: number }

export function App() {
  const [state, setState] = useState<Screen>({ screen: 'home' })
  const nextId = useRef(0)

  useEffect(() => {
    startUpdateStore()
    loadPresets().catch(() => {
      // 설정을 못 읽으면 기본 프리셋으로 계속한다
    })
  }, [])

  // 홈 화면에서는 디스코드에 곡 정보 없이 RCM만 보인다
  useEffect(() => {
    if (state.screen === 'home') window.rcm.setPresence(null)
  }, [state.screen])

  const openProject = useCallback((files: ProjectFiles) => {
    setState({ screen: 'editor', files, id: nextId.current++ })
  }, [])
  const goHome = useCallback(() => setState({ screen: 'home' }), [])

  return (
    <DialogProvider>
      <ToastProvider>
        {state.screen === 'home' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <TitleBar title="RCM" />
            <HomeScreen onOpened={openProject} />
          </div>
        ) : (
          <EditorScreen
            key={state.id}
            files={state.files}
            onExit={goHome}
            onOpenProject={openProject}
          />
        )}
        <UpdateNotice />
      </ToastProvider>
    </DialogProvider>
  )
}
