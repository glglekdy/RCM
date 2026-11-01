/** 큰 파일은 Firefox·Safari가 내려받기를 시작하는 데 오래 걸려서 URL을 바로 해제하면 실패한다 */
const REVOKE_DELAY_MS = 40_000

/**
 * 데이터를 `<a download>`로 내려받는다. 웹은 저장 위치를 알 수 없으므로 파일 이름을 돌려준다.
 * (화면 문구는 "○○을(를) 내려받았어요")
 */
export function download(name: string, data: Blob | string, type: string): string {
  const blob = data instanceof Blob ? data : new Blob([data], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.style.display = 'none'
  document.body.appendChild(a)
  try {
    a.click()
  } finally {
    a.remove()
    // 브라우저가 내려받기를 시작할 시간을 준 뒤 해제한다
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
  }
  return name
}
