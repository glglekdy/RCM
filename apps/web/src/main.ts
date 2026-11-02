import { installed } from './installApi'

// 브라우저가 저장소를 임의로 비우지 못하게 요청한다 (거절돼도 그대로 쓴다)
void navigator.storage?.persist?.().catch(() => {})

// 정적 import는 installApi의 top-level await을 기다리지 않고 먼저 실행될 수 있다.
// renderer가 처음 그릴 때 window.rcm이 있어야 하므로 설치가 끝난 뒤에 동적으로 불러온다.
// 저장소를 열지 못했으면 installApi가 안내를 그렸으므로 화면을 시작하지 않는다
if (installed) await import('../../editor/src/renderer/src/main')
