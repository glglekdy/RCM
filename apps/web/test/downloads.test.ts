import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { download } from '../src/api/downloads'

describe('download', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('document', {
      createElement: () => ({ style: {}, click: () => {}, remove: () => {} }),
      body: { appendChild: () => {} }
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('큰 파일도 받을 수 있게 40초 뒤에 URL을 해제해요', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    expect(download('a.zip', 'x', 'application/zip')).toBe('a.zip')
    vi.advanceTimersByTime(39_999)
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(revoke).toHaveBeenCalledWith('blob:x')
  })
})
