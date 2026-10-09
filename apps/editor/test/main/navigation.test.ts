import { describe, expect, it } from 'vitest'
import { isAllowedNavigation } from '../../src/main/navigation'

describe('isAllowedNavigation', () => {
  const app = 'file:///C:/Program%20Files/RCM/resources/app.asar/out/renderer/index.html'

  it('배포판은 앱 자신의 index.html(새로고침)만 허용', () => {
    expect(isAllowedNavigation(app, app)).toBe(true)
    expect(isAllowedNavigation(`${app}#x`, app)).toBe(true)
    expect(isAllowedNavigation('file:///C:/music/song.mp3', app)).toBe(false)
    expect(isAllowedNavigation('file:///C:/evil/index.html', app)).toBe(false)
    expect(isAllowedNavigation('https://example.com/', app)).toBe(false)
  })
  it('개발 중에는 개발 서버와 같은 origin만 허용', () => {
    const dev = 'http://localhost:5173'
    expect(isAllowedNavigation('http://localhost:5173/', dev)).toBe(true)
    expect(isAllowedNavigation('http://localhost:5173/index.html?x=1', dev)).toBe(true)
    expect(isAllowedNavigation('http://localhost:5174/', dev)).toBe(false)
    expect(isAllowedNavigation('file:///C:/music/song.mp3', dev)).toBe(false)
    expect(isAllowedNavigation('https://localhost:5173/', dev)).toBe(false)
  })
  it('잘못된 URL은 막는다', () => {
    expect(isAllowedNavigation('not a url', 'http://localhost:5173')).toBe(false)
    expect(isAllowedNavigation('http://localhost:5173/', 'not a url')).toBe(false)
  })
})
