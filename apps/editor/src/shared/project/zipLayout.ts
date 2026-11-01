import { isProjectFileName } from './files'

/**
 * 프로젝트 파일이 든 ZIP 안 폴더 (`''` 또는 `'My Song/'`). song.json은 ZIP 바로 안이나 폴더 하나 안에
 * 딱 하나 있어야 한다 (탐색기의 "압축(ZIP) 폴더"는 폴더째 넣는다). macOS가 넣는 `__MACOSX/`는 무시한다.
 */
export function projectPrefix(names: readonly string[]): string {
  const songs = names.filter((n) => {
    const parts = n.split('/')
    return parts.length <= 2 && parts[parts.length - 1] === 'song.json' && parts[0] !== '__MACOSX'
  })
  if (songs.length === 0) throw new Error('RCM 프로젝트가 아니에요 (song.json이 없어요)')
  if (songs.length > 1) throw new Error('프로젝트가 여러 개 들어 있어요. ZIP 하나에 프로젝트 하나만 넣어 주세요')
  return songs[0].slice(0, -'song.json'.length)
}

/**
 * ZIP 항목 이름들에서 프로젝트 폴더(`prefix`)와, 그 바로 아래의 프로젝트 파일(`isProjectFileName`)을 고른다.
 * `files`는 입력의 전체 항목 이름이다 (prefix를 떼지 않음). 하위 폴더 파일은 제외한다.
 */
export function projectEntries(names: readonly string[]): { prefix: string; files: string[] } {
  const prefix = projectPrefix(names)
  const files = names.filter((n) => {
    if (!n.startsWith(prefix)) return false
    const name = n.slice(prefix.length)
    return !name.includes('/') && isProjectFileName(name)
  })
  return { prefix, files }
}
