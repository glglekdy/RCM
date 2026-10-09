import { useState } from 'react'
import type { ProjectFiles } from '../../shared/api'
import { EditorScreen } from './editor/EditorScreen'
import { HomeScreen } from './home/HomeScreen'
import { DialogProvider, TitleBar, ToastProvider } from './ui'

type Screen = { screen: 'home' } | { screen: 'editor'; files: ProjectFiles }

export function App() {
  const [state, setState] = useState<Screen>({ screen: 'home' })

  return (
    <DialogProvider>
      <ToastProvider>
        {state.screen === 'home' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <TitleBar title="RCM" />
            <HomeScreen onOpened={(files) => setState({ screen: 'editor', files })} />
          </div>
        ) : (
          <EditorScreen files={state.files} onExit={() => setState({ screen: 'home' })} />
        )}
      </ToastProvider>
    </DialogProvider>
  )
}
