import { describe, expect, it } from 'vitest'
import type { UpdateState } from '../../../src/shared/api'
import { updateStatusText } from '../../../src/renderer/src/update/updateText'

describe('업데이트 상태 문구', () => {
  it.each([
    [{ kind: 'idle' }, null],
    [{ kind: 'checking' }, '확인 중…'],
    [{ kind: 'latest', version: '0.1.1' }, '최신 버전이에요'],
    [{ kind: 'downloading', version: '0.1.2', percent: 42 }, '0.1.2 받는 중 42%'],
    [{ kind: 'ready', version: '0.1.2' }, '0.1.2 준비됨'],
    [{ kind: 'error', message: 'net' }, '확인하지 못했어요'],
  ])('%#', (s, text) => expect(updateStatusText(s as UpdateState)).toBe(text))
})
