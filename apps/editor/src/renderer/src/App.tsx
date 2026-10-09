import { useState } from 'react'
import type { ProjectFiles } from '../../shared/api'
import { HomeScreen } from './home/HomeScreen'
import { DialogProvider, TitleBar, ToastProvider } from './ui'

type Screen = { screen: 'home' } | { screen: 'editor'; files: ProjectFiles }

export function App() {
  const [state, setState] = useState<Screen>({ screen: 'home' })

  return (
    <DialogProvider>
      <ToastProvider>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <TitleBar title="RCM" />
          {state.screen === 'home' ? (
            <HomeScreen onOpened={(files) => setState({ screen: 'editor', files })} />
          ) : (
            <div>{state.files.dir}</div>
          )}
        </div>
      </ToastProvider>
    </DialogProvider>
  )
}
