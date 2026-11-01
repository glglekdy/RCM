/** 경로(`/`·`\` 모두)의 마지막 조각 */
const lastPart = (name: string): string => name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1)

/** 소문자 확장자(`'.ogg'`). 없으면 `''`. 경로 구분자는 `/`·`\` 모두 처리한다 (node:path 없이). */
export function extOf(name: string): string {
  const base = lastPart(name)
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? '' : base.slice(dot).toLowerCase()
}

const AUDIO_EXTENSIONS = ['.ogg', '.mp3', '.wav']

export const isAudioFile = (name: string): boolean => AUDIO_EXTENSIONS.includes(extOf(name))

export const isChartFileName = (name: string): boolean => name.toLowerCase().endsWith('.chart.json')

/** 프로젝트 폴더에서 가져오는 파일. 그 밖의 파일(그림, 실행 파일 등)은 건너뛴다 */
export const isProjectFileName = (name: string): boolean =>
  name === 'song.json' || name === 'editor.json' || isChartFileName(name) || isAudioFile(name)

/** ZIP 항목 이름이 폴더 밖을 가리키지 않는지: `..` 조각, 절대 경로, `\`, `C:` 같은 드라이브 문자는 안 된다. */
export function isSafeZipEntry(name: string): boolean {
  if (name.startsWith('/') || name.includes('\\') || /^[a-zA-Z]:/.test(name)) return false
  return !name.split('/').includes('..')
}

/**
 * 에디터가 프로젝트에 복사해 넣는 음악 파일 이름: `곡 (RCM).ogg`, `곡 (2) (RCM).mp3` …
 * 예전 버전이 만든 `audio.ogg`, `audio-2.mp3` …도 포함한다.
 */
const COPIED_AUDIO_NAME = /( \(\d+\))? \(RCM\)\.(ogg|mp3|wav)$|^audio(-\d+)?\.(ogg|mp3|wav)$/i

export const isCopiedAudioName = (name: string): boolean => COPIED_AUDIO_NAME.test(name)

/**
 * 원래 파일 이름 뒤에 ` (RCM)`을 붙인, `exists`가 false인 이름. 이미 붙어 있던 표시는 떼고 다시 붙인다.
 * `source`는 경로든 이름이든 마지막 조각만 쓴다.
 */
export function copiedAudioName(source: string, exists: (name: string) => boolean): string {
  const base = lastPart(source)
  const ext = extOf(base)
  const stem = base.slice(0, base.length - ext.length).replace(/( \(\d+\))? \(RCM\)$/i, '')
  for (let n = 1; ; n++) {
    const name = n === 1 ? `${stem} (RCM)${ext}` : `${stem} (${n}) (RCM)${ext}`
    if (!exists(name)) return name
  }
}
