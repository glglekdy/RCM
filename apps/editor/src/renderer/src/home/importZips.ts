import type { RcmApi } from '../../../shared/api'

export interface ZipImportResult {
  imported: number
  /** `파일 이름: 이유` */
  failed: string[]
}

/** IPC가 오류 앞에 붙이는 `Error invoking remote method '…': Error: `를 뗀 메시지 */
export function ipcErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')
}

/** 끌어다 놓은 파일을 하나씩 프로젝트로 가져온다. 하나가 실패해도 나머지는 계속한다. */
export async function importZips(
  files: readonly File[],
  api: Pick<RcmApi, 'importProjectZip' | 'pathForFile'>
): Promise<ZipImportResult> {
  const result: ZipImportResult = { imported: 0, failed: [] }
  for (const file of files) {
    const zipPath = api.pathForFile(file)
    if (!file.name.toLowerCase().endsWith('.zip') || zipPath === '') {
      result.failed.push(`${file.name}: ZIP 파일이 아니에요`)
      continue
    }
    try {
      await api.importProjectZip(zipPath)
      result.imported++
    } catch (err) {
      result.failed.push(`${file.name}: ${ipcErrorMessage(err)}`)
    }
  }
  return result
}
