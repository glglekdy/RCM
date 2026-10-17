import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { GuideFile } from '../../shared/api'
import { writeFileAtomic } from '../project/atomicWrite'

/** 자동 문서 업데이트에 넣어 둘 수 있는 파일 수 */
export const MAX_GUIDE_FILES = 50

const isGuidePath = (raw: unknown): raw is string =>
  typeof raw === 'string' && path.isAbsolute(raw) && path.extname(raw).toLowerCase() === '.md'

/** 같은 파일을 가리키는지. Windows는 대소문자를 구별하지 않는다. */
export function sameGuidePath(a: string, b: string, platform = process.platform): boolean {
  const norm = (p: string) => (platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p))
  return norm(a) === norm(b)
}

/** 설정에서 읽은 목록 정리: `.md` 절대 경로만, 중복 없이, 최대 {@link MAX_GUIDE_FILES}개. */
export function sanitizeGuidePaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const p of raw) {
    if (isGuidePath(p) && !out.some((q) => sameGuidePath(p, q))) out.push(p)
  }
  return out.slice(0, MAX_GUIDE_FILES)
}

/** 목록 끝에 파일을 더한다. 이미 있으면 그대로. 잘못된 경로거나 목록이 가득 찼으면 throw. */
export function addGuidePath(list: string[], file: string): string[] {
  if (!isGuidePath(file)) throw new Error('가이드 파일은 .md 파일로 저장해 주세요')
  if (list.some((p) => sameGuidePath(p, file))) return list
  if (list.length >= MAX_GUIDE_FILES) throw new Error(`자동 업데이트는 ${MAX_GUIDE_FILES}개까지 넣을 수 있어요`)
  return [...list, file]
}

const sameText = (a: string, b: string): boolean => a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n')

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/**
 * 파일을 가이드 내용(`text`)으로 맞춘다. 줄바꿈(CRLF/LF)만 다르면 같은 내용으로 본다.
 * 파일이 없으면 다시 만들지 않는다 (옮기거나 지운 파일을 되살리지 않도록).
 */
export async function syncGuideFile(file: string, text: string): Promise<GuideFile> {
  let current: string
  try {
    current = await fs.readFile(file, 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return { path: file, status: 'missing' }
    return { path: file, status: 'error', error: messageOf(err) }
  }
  if (sameText(current, text)) return { path: file, status: 'current' }
  try {
    await writeFileAtomic(file, text)
    return { path: file, status: 'updated' }
  } catch (err) {
    return { path: file, status: 'error', error: messageOf(err) }
  }
}

export function syncGuideFiles(files: string[], text: string): Promise<GuideFile[]> {
  return Promise.all(files.map((f) => syncGuideFile(f, text)))
}
