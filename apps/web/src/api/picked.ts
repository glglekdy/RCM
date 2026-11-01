/** 고른 파일은 새로고침하면 사라지는 메모리 Map에 둔다. 경로는 `picked:<id>/<파일 이름>` (화면이 경로 끝에서 이름을 읽는다) */
const files = new Map<string, File>()
let next = 0

const PREFIX = 'picked:'

/** `cancel` 이벤트가 없는 브라우저에서 포커스가 돌아온 뒤 취소로 보기까지 기다리는 시간 */
const FOCUS_CANCEL_MS = 1500
/** 이 페이지에서 `cancel` 이벤트가 한 번이라도 왔는지 (오면 이 브라우저는 cancel을 지원한다) */
let cancelSeen = false

export function registerPicked(file: File): string {
  const path = `${PREFIX}${++next}/${file.name}`
  files.set(path, file)
  return path
}

export function getPicked(path: string): File {
  const file = files.get(path)
  if (!file) throw new Error('파일을 다시 골라 주세요')
  return file
}

export const isPickedPath = (path: string): boolean => path.startsWith(PREFIX)

/** 숨긴 `<input type="file">`로 파일을 고른다. 취소하면 빈 배열 */
export function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.style.display = 'none'
    let done = false
    const finish = (picked: File[]): void => {
      if (done) return
      done = true
      window.removeEventListener('focus', onFocus)
      input.remove()
      resolve(picked)
    }
    // `cancel` 이벤트가 없는 브라우저: 창이 다시 포커스를 받고 FOCUS_CANCEL_MS 안에 `change`가 없으면 취소로 본다.
    // 안드로이드의 클라우드 파일은 `change`가 늦게 오므로 넉넉히 기다리고, `cancel`을 한 번이라도 봤으면 쓰지 않는다
    const onFocus = (): void => {
      if (cancelSeen) return
      setTimeout(() => {
        if (!input.files || input.files.length === 0) finish([])
      }, FOCUS_CANCEL_MS)
    }
    input.addEventListener('change', () => finish([...(input.files ?? [])]))
    input.addEventListener('cancel', () => {
      cancelSeen = true
      finish([])
    })
    window.addEventListener('focus', onFocus)
    document.body.appendChild(input)
    input.click()
  })
}
