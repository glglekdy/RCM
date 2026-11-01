import type { Capabilities } from '../../../shared/api'

/** 실행 환경이 지원하는 기능 (PC는 대부분 true, 웹은 대부분 false) */
export function caps(): Capabilities {
  return window.rcm.capabilities
}

/** 프로젝트 삭제 확인 문구. 휴지통이 없으면 영구 삭제라고 알린다. */
export function deleteCopy(
  trash: boolean,
  count: number
): { title: string; message: string; confirm: string } {
  if (trash) {
    return {
      title: `프로젝트 ${count}개를 삭제할까요?`,
      message: '프로젝트 폴더를 휴지통으로 보내요. 휴지통에서 되살릴 수 있어요.',
      confirm: '삭제'
    }
  }
  return {
    title: `프로젝트 ${count}개를 영구 삭제할까요?`,
    message: '지우면 되돌릴 수 없어요. 지우기 전에 ZIP으로 내보낼 수 있어요.',
    confirm: '영구 삭제'
  }
}

/** 저장 결과 알림. 경로를 보여 주는 환경(PC)은 저장한 위치를, 웹은 내려받은 파일 이름을 알린다. */
export function savedMessage(what: string, result: string, revealsPath: boolean): string {
  return revealsPath ? `${what}을(를) ${result}에 저장했어요` : `${result}을(를) 내려받았어요`
}

/** ogg를 디코딩하지 못한 브라우저라면 mp3를 쓰라는 안내. 아니면 null */
export function oggHint(fileName: string, err: unknown): string | null {
  const name = err instanceof Error ? err.name : ''
  const message = err instanceof Error ? err.message : String(err)
  const decodeFailed = name === 'EncodingError' || message.toLowerCase().includes('decode')
  if (fileName.toLowerCase().endsWith('.ogg') && decodeFailed) {
    return '이 브라우저는 ogg를 재생하지 못해요. mp3를 써 주세요'
  }
  return null
}

/** 음악 파일을 열지 못했을 때 보여 줄 첫 줄 */
export function audioLoadError(fileName: string, err: unknown): string {
  return oggHint(fileName, err) ?? (err instanceof Error ? err.message : String(err))
}
