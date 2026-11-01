/** 고른 파일은 새로고침하면 사라지는 메모리 Map에 둔다. 경로는 `picked:<id>` */
const files = new Map<string, File>()
let next = 0

const PREFIX = 'picked:'

export function registerPicked(file: File): string {
  const path = `${PREFIX}${++next}`
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
    // `cancel` 이벤트가 없는 브라우저: 창이 다시 포커스를 받고 300ms 안에 `change`가 없으면 취소로 본다
    const onFocus = (): void => {
      setTimeout(() => {
        if (!input.files || input.files.length === 0) finish([])
      }, 300)
    }
    input.addEventListener('change', () => finish([...(input.files ?? [])]))
    input.addEventListener('cancel', () => finish([]))
    window.addEventListener('focus', onFocus)
    document.body.appendChild(input)
    input.click()
  })
}
