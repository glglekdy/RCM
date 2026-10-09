import { promises as fs } from 'node:fs'

let counter = 0

/** 원자적 저장용 임시 파일 경로. 동시에 저장해도 서로 겹치지 않는다. */
function tempPathFor(target: string): string {
  return `${target}.tmp-${process.pid}-${++counter}-${Math.random().toString(36).slice(2, 8)}`
}

const RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])
const MAX_RETRIES = 10

/** Windows는 같은 대상으로 동시에 rename하거나 백신이 파일을 잡고 있으면 EPERM 등을 낸다. 잠시 뒤 다시 시도한다. */
async function renameRetrying(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to)
      return
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? ''
      if (attempt >= MAX_RETRIES || !RETRY_CODES.has(code)) throw e
      await new Promise((r) => setTimeout(r, 10 * (attempt + 1)))
    }
  }
}

/** 임시 파일에 쓴 뒤 rename한다. 실패하면 임시 파일을 지운다. */
export async function writeFileAtomic(target: string, text: string): Promise<void> {
  const tmp = tempPathFor(target)
  try {
    await fs.writeFile(tmp, text, 'utf8')
    await renameRetrying(tmp, target)
  } catch (e) {
    await fs.rm(tmp, { force: true })
    throw e
  }
}
