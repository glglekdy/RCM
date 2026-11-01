import { createWebApi } from './api'

/** 브라우저 저장소(IndexedDB)를 열 수 없을 때 빈 화면 대신 보여 주는 안내 */
function showStorageError(err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err)
  const root = document.getElementById('root')
  if (!root) return
  const box = document.createElement('div')
  box.style.cssText = 'padding:32px 16px;font:16px/1.6 system-ui,sans-serif;max-width:480px;margin:0 auto'
  const message = document.createElement('p')
  message.textContent = '브라우저 저장소를 열 수 없어요. 시크릿 창이 아닌지, 사이트 데이터가 막혀 있지 않은지 확인해 주세요'
  const reason = document.createElement('p')
  reason.style.cssText = 'opacity:0.7;font-size:14px'
  reason.textContent = detail
  box.append(message, reason)
  root.replaceChildren(box)
}

/** 웹용 `RcmApi`를 `window.rcm`에 설치한다. 저장소를 열 수 없으면 안내를 그리고 false (이때 화면을 시작하면 안 된다) */
export const installed: boolean = await (async () => {
  try {
    window.rcm = await createWebApi()
    return true
  } catch (err) {
    console.error(err)
    showStorageError(err)
    return false
  }
})()
