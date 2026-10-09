/**
 * 창이 `url`로 이동해도 되는지. 앱은 한 페이지라서 자기 자신(새로고침)으로만 이동한다.
 * `appUrl`은 앱 페이지 주소: 개발 중에는 Vite 개발 서버(같은 origin 허용), 배포판에서는
 * index.html의 file: URL(같은 파일만 허용). 그 밖의 이동(창에 끌어다 놓은 파일, 링크 등)은 막는다.
 */
export function isAllowedNavigation(url: string, appUrl: string): boolean {
  try {
    const target = new URL(url)
    const app = new URL(appUrl)
    if (app.protocol === 'file:') {
      // file: URL의 origin은 모두 'null'이라 비교할 수 없으므로 경로까지 같아야 한다
      return target.protocol === 'file:' && target.pathname === app.pathname
    }
    return target.origin === app.origin
  } catch {
    return false
  }
}
