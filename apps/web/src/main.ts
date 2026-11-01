import './installApi'
// 정적 import는 installApi의 top-level await을 기다리지 않고 먼저 실행될 수 있다.
// renderer가 처음 그릴 때 window.rcm이 있어야 하므로 설치가 끝난 뒤에 동적으로 불러온다
await import('../../editor/src/renderer/src/main')
