import { DialogProvider, TitleBar, ToastProvider } from './ui'

export function App() {
  return (
    <DialogProvider>
      <ToastProvider>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <TitleBar title="RCM" />
          <div style={{ flex: 1 }} />
        </div>
      </ToastProvider>
    </DialogProvider>
  )
}
