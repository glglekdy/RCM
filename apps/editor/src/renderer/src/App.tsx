import { TitleBar } from './ui/TitleBar'

export function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TitleBar title="RCM" />
      <div style={{ flex: 1 }} />
    </div>
  )
}
