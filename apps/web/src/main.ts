import { connectInstallPrompt } from './captureInstall'
import { registerSW } from 'virtual:pwa-register'
import { installed } from './installApi'

// 정적 import는 installApi의 top-level await을 기다리지 않고 먼저 실행될 수 있다.
// renderer가 처음 그릴 때 window.rcm이 있어야 하므로 설치가 끝난 뒤에 동적으로 불러온다.
// 저장소를 열지 못했으면 installApi가 안내를 그렸으므로 화면을 시작하지 않는다
if (installed) {
  const { setInstallPrompt, setUpdateReady } = await import('../../editor/src/renderer/src/web/pwaStore')
  connectInstallPrompt(setInstallPrompt)
  await import('../../editor/src/renderer/src/main')
  const updateSW = registerSW({ onNeedRefresh: () => setUpdateReady(updateSW) })
}
