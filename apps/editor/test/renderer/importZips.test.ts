import { describe, it, expect } from 'vitest'
import { importZips, ipcErrorMessage } from '../../src/renderer/src/home/importZips'

const file = (name: string): File => new File(['x'], name)

describe('importZips', () => {
  it('ZIP만 하나씩 가져오고, 실패한 파일은 이유와 함께 모은다', async () => {
    const calls: string[] = []
    const api = {
      pathForFile: (f: File) => (f.name === 'web.zip' ? '' : `C:\\drop\\${f.name}`),
      importProjectZip: async (p: string) => {
        calls.push(p)
        if (p.endsWith('bad.zip')) {
          throw new Error("Error invoking remote method 'rcm:import-project-zip': Error: song.json을 읽을 수 없어요")
        }
        return { dir: 'D:\\x' }
      }
    }
    const r = await importZips([file('a.ZIP'), file('bad.zip'), file('song.json'), file('web.zip'), file('b.zip')], api)
    expect(calls).toEqual(['C:\\drop\\a.ZIP', 'C:\\drop\\bad.zip', 'C:\\drop\\b.zip'])
    expect(r).toEqual({
      imported: 2,
      failed: ['bad.zip: song.json을 읽을 수 없어요', 'song.json: ZIP 파일이 아니에요', 'web.zip: ZIP 파일이 아니에요']
    })
  })

  it('IPC 오류 머리말을 뗀다', () => {
    expect(ipcErrorMessage(new Error("Error invoking remote method 'x': Error: 이유"))).toBe('이유')
    expect(ipcErrorMessage(new Error('그대로'))).toBe('그대로')
    expect(ipcErrorMessage('문자열')).toBe('문자열')
  })
})
