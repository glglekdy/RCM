import { describe, it, expect } from 'vitest'
import { audioLoadError, deleteCopy, savedMessage } from '../../src/renderer/src/ui/platform'

describe('deleteCopy', () => {
  it('휴지통이 있으면 되살릴 수 있다고 알린다', () => {
    expect(deleteCopy(true, 2)).toEqual({
      title: '프로젝트 2개를 삭제할까요?',
      message: '프로젝트 폴더를 휴지통으로 보내요. 휴지통에서 되살릴 수 있어요.',
      confirm: '삭제'
    })
  })

  it('휴지통이 없으면 영구 삭제라고 알린다', () => {
    expect(deleteCopy(false, 2)).toEqual({
      title: '프로젝트 2개를 영구 삭제할까요?',
      message: '지우면 되돌릴 수 없어요. 지우기 전에 ZIP으로 내보낼 수 있어요.',
      confirm: '영구 삭제'
    })
  })
})

describe('savedMessage', () => {
  it('경로를 보여 주는 환경에서는 저장한 위치를 알린다', () => {
    expect(savedMessage('프로젝트 ZIP', '/x/a.zip', true)).toBe('프로젝트 ZIP을(를) /x/a.zip에 저장했어요')
  })

  it('웹에서는 내려받았다고 알린다', () => {
    expect(savedMessage('채보', 'hard.chart.json', false)).toBe('hard.chart.json을(를) 내려받았어요')
  })
})

describe('audioLoadError', () => {
  it('ogg를 디코딩하지 못하면 mp3를 안내한다', () => {
    const msg = '이 브라우저는 ogg를 재생하지 못해요. mp3를 써 주세요'
    expect(audioLoadError('a.ogg', new DOMException('x', 'EncodingError'))).toBe(msg)
    expect(audioLoadError('A.OGG', new Error('Unable to decode audio data'))).toBe(msg)
  })

  it('ogg가 아니거나 디코딩 오류가 아니면 오류 메시지를 그대로 쓴다', () => {
    expect(audioLoadError('a.mp3', new DOMException('x', 'EncodingError'))).toBe('x')
    expect(audioLoadError('a.ogg', new Error('파일을 찾을 수 없어요'))).toBe('파일을 찾을 수 없어요')
    expect(audioLoadError('a.ogg', 'boom')).toBe('boom')
  })
})
