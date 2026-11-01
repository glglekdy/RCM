import { promises as fs } from 'node:fs'
import path from 'node:path'
import { parseSong } from '@rcm/core'
import { zipSync, type Zippable } from 'fflate'
import { isAudioFile, isProjectFileName } from '../../shared/project/files'
import { sanitizeFolderName } from '../../shared/project/folderName'

/**
 * 프로젝트 폴더를 ZIP으로 묶는다. ZIP 이름과 안쪽 폴더 이름은 곡 제목(`sanitizeFolderName`)이고,
 * 프로젝트 파일(song.json, editor.json, `*.chart.json`, 음악)만 넣는다. 하위 폴더는 넣지 않는다.
 */
export async function buildProjectZip(dir: string): Promise<{ name: string; data: Uint8Array }> {
  let songText: string
  try {
    songText = await fs.readFile(path.join(dir, 'song.json'), 'utf8')
  } catch {
    throw new Error('song.json을 찾을 수 없어요')
  }
  const song = parseSong(songText)
  if (!song.ok) throw new Error('song.json을 읽을 수 없어요')
  const folder = sanitizeFolderName(song.value.title)

  const zippable: Zippable = {}
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !isProjectFileName(entry.name)) continue
    const bytes = new Uint8Array(await fs.readFile(path.join(dir, entry.name)))
    // 음악은 이미 압축돼 있으므로 다시 압축하지 않는다
    zippable[`${folder}/${entry.name}`] = isAudioFile(entry.name) ? [bytes, { level: 0 }] : bytes
  }
  return { name: `${folder}.zip`, data: zipSync(zippable) }
}
