import { parseSong } from '@rcm/core'
import type { CreateProjectOptions, ProjectFiles, RecentProject, TrashFailure } from '../../../editor/src/shared/api'
import {
  copiedAudioName,
  isAudioFile,
  isChartFileName,
  isCopiedAudioName,
  isProjectFileName
} from '../../../editor/src/shared/project/files'
import { buildNewProject, validateCreateProjectOptions } from '../../../editor/src/shared/project/newProject'
import { summarizeProjectFiles } from '../../../editor/src/shared/project/summary'
import { req, tx } from './db'
import { getPicked, isPickedPath } from './picked'

export interface ProjectDeps {
  /** `navigator.locks`와 같은 모양. `ifAvailable`이면 잠금을 못 잡을 때 콜백이 `null`로 불린다 */
  locks: {
    request(name: string, opts: { ifAvailable: true }, cb: (lock: unknown) => Promise<void>): Promise<void>
  }
  now(): number
  uuid(): string
}

export type ImportedFile = { name: string; data: string | Blob }

export interface WebProjects {
  createProject(opts: CreateProjectOptions): Promise<{ dir: string }>
  openProject(dir: string): Promise<ProjectFiles>
  closeProject(dir: string): Promise<void>
  writeProjectFiles(dir: string, files: { name: string; text: string }[]): Promise<void>
  deleteProjectFiles(dir: string, names: string[]): Promise<void>
  readAudio(path: string): Promise<ArrayBuffer>
  importProjectAudio(dir: string, source: string): Promise<string>
  getRecentProjects(): Promise<RecentProject[]>
  removeRecentProject(dir: string): Promise<void>
  trashProjects(dirs: string[]): Promise<TrashFailure[]>
  addImported(files: ImportedFile[]): Promise<{ dir: string }>
  listFiles(dir: string): Promise<ImportedFile[]>
}

type FileRecord = { projectId: string; name: string } & ({ text: string } | { blob: Blob })

const BAD_DIR = '프로젝트 경로가 올바르지 않아요'
const NO_PROJECT = '프로젝트를 찾을 수 없어요'
const BUSY = '다른 탭에서 열려 있어요'
const BAD_AUDIO = '음악 파일은 ogg, mp3, wav만 쓸 수 있어요'

const DIR_PREFIX = 'web:'

const dirOf = (id: string): string => `${DIR_PREFIX}${id}`

/** `web:<id>`에서 id를 꺼낸다. 형식이 틀리면 throw */
function parseDir(dir: unknown): string {
  if (typeof dir !== 'string' || !dir.startsWith(DIR_PREFIX)) throw new Error(BAD_DIR)
  const id = dir.slice(DIR_PREFIX.length)
  if (id === '' || id.includes('/')) throw new Error(BAD_DIR)
  return id
}

/** 프로젝트 바로 아래의 파일 이름(경로 없음)인지 */
const isPlainName = (name: unknown): name is string =>
  typeof name === 'string' && name !== '' && !name.includes('/') && !name.includes('\\')

function disallowed(name: string): Error {
  return new Error(`허용되지 않는 파일 이름이에요: ${name}`)
}

function checkWritable(name: string): void {
  if (!isPlainName(name) || !(name === 'song.json' || name === 'editor.json' || isChartFileName(name))) {
    throw disallowed(name)
  }
}

const rangeOf = (id: string): IDBKeyRange => IDBKeyRange.bound([id, ''], [id, '￿'])

const recordOf = (id: string, name: string, data: string | Blob): FileRecord =>
  typeof data === 'string' ? { projectId: id, name, text: data } : { projectId: id, name, blob: data }

const textOf = (r: FileRecord | undefined): string | null => (r && 'text' in r ? r.text : null)

async function assertProject(t: IDBTransaction, id: string): Promise<void> {
  if ((await req(t.objectStore('projects').get(id))) === undefined) throw new Error(NO_PROJECT)
}

/** 프로젝트의 파일 키(이름)들 */
async function namesOf(t: IDBTransaction, id: string): Promise<string[]> {
  const keys = await req(t.objectStore('files').getAllKeys(rangeOf(id)))
  return keys.map((k) => (k as [string, string])[1])
}

/**
 * 파일을 쓴다. 대소문자만 다른 기존 이름은 지우고 새 이름으로 쓴다 (PC의 대소문자 구분 없는 파일 시스템과 같다).
 * IDB 요청 말고는 await하지 않는다.
 */
async function putFiles(t: IDBTransaction, id: string, files: ImportedFile[]): Promise<void> {
  const store = t.objectStore('files')
  const existing = await namesOf(t, id)
  for (const f of files) {
    const lower = f.name.toLowerCase()
    for (const old of existing) {
      if (old.toLowerCase() === lower && old !== f.name) store.delete([id, old])
    }
    store.put(recordOf(id, f.name, f.data))
  }
}

export function createProjects(db: IDBDatabase, deps: ProjectDeps): WebProjects {
  // --- 탭 잠금: 프로젝트마다 이 탭 안에서 세는다 ---
  interface Held {
    count: number
    ready: Promise<void>
    release(): void
  }
  const held = new Map<string, Held>()

  async function acquire(id: string): Promise<void> {
    const current = held.get(id)
    if (current) {
      current.count++
      await current.ready
      return
    }
    let release!: () => void
    const hold = new Promise<void>((resolve) => (release = resolve))
    const entry: Held = { count: 1, ready: undefined as unknown as Promise<void>, release }
    entry.ready = new Promise<void>((resolve, reject) => {
      deps.locks
        .request(`rcm-project:${id}`, { ifAvailable: true }, (lock) => {
          if (!lock) {
            reject(new Error(BUSY))
            return Promise.resolve()
          }
          resolve()
          return hold
        })
        .catch(reject)
    })
    held.set(id, entry)
    try {
      await entry.ready
    } catch (e) {
      if (held.get(id) === entry) held.delete(id)
      throw e
    }
  }

  function release(id: string): void {
    const entry = held.get(id)
    if (!entry) return
    if (--entry.count > 0) return
    held.delete(id)
    entry.release()
  }

  /** 다른 탭이 잡고 있는지 잠깐 잡아 본다 */
  async function isLockedElsewhere(id: string): Promise<boolean> {
    let busy = false
    await deps.locks.request(`rcm-project:${id}`, { ifAvailable: true }, async (lock) => {
      busy = !lock
    })
    return busy
  }

  async function deleteProject(id: string): Promise<void> {
    await tx(db, ['projects', 'files'], 'readwrite', (t) => {
      t.objectStore('projects').delete(id)
      t.objectStore('files').delete(rangeOf(id))
    })
  }

  /** 음악으로 쓸 수 있는 고른 파일을 꺼낸다 (등록되지 않았으면 getPicked의 오류) */
  function pickedAudio(source: string): File {
    if (!isPickedPath(source)) throw new Error(BAD_AUDIO)
    const file = getPicked(source)
    if (!isAudioFile(file.name)) throw new Error(BAD_AUDIO)
    return file
  }

  return {
    async createProject(raw) {
      // 고른 음악은 트랜잭션 밖에서 먼저 확인한다: 없으면 아무것도 만들지 않는다
      const rawAudio = (raw as { audioPath?: unknown } | null)?.audioPath
      let audioFile: File | null = null
      if (typeof rawAudio === 'string' && isPickedPath(rawAudio)) audioFile = pickedAudio(rawAudio)
      const opts = validateCreateProjectOptions(raw, {
        isParentDir: (v): v is string => typeof v === 'string',
        isAudioSource: (v): v is string => typeof v === 'string' && audioFile !== null && v === rawAudio
      })
      const audioName = audioFile ? copiedAudioName(audioFile.name, () => false) : ''
      const id = deps.uuid()
      const now = deps.now()
      await tx(db, ['projects', 'files'], 'readwrite', (t) => {
        t.objectStore('projects').put({ id, createdAt: now, lastOpened: now })
        const files: ImportedFile[] = buildNewProject(opts, audioName).map((f) => ({ name: f.name, data: f.text }))
        if (audioFile) files.push({ name: audioName, data: audioFile })
        const store = t.objectStore('files')
        for (const f of files) store.put(recordOf(id, f.name, f.data))
      })
      return { dir: dirOf(id) }
    },

    async openProject(dir) {
      const id = parseDir(dir)
      await acquire(id)
      try {
        return await tx(db, ['projects', 'files'], 'readwrite', async (t): Promise<ProjectFiles> => {
          const projects = t.objectStore('projects')
          const project = (await req(projects.get(id))) as { id: string; createdAt: number; lastOpened: number } | undefined
          if (!project) throw new Error(NO_PROJECT)
          const store = t.objectStore('files')
          const records = (await req(store.getAll(rangeOf(id)))) as FileRecord[]
          const song = textOf(records.find((r) => r.name === 'song.json'))
          if (song === null) throw new Error('song.json을 찾을 수 없어요')
          // song.json이 가리키지 않는, 에디터가 복사해 넣은 음악을 정리한다 (PC `removeUnusedAudio`와 같은 규칙)
          const parsed = parseSong(song)
          let kept = records
          if (parsed.ok) {
            const keep = parsed.value.audio.toLowerCase()
            const unused = records.filter((r) => isCopiedAudioName(r.name) && r.name.toLowerCase() !== keep)
            for (const r of unused) store.delete([id, r.name])
            kept = records.filter((r) => !unused.includes(r))
          }
          projects.put({ ...project, lastOpened: deps.now() })
          const charts = kept
            .filter((r) => isChartFileName(r.name) && 'text' in r)
            .map((r) => ({ file: r.name, text: textOf(r) as string }))
            .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
          return {
            dir,
            songText: song,
            charts,
            editorText: textOf(kept.find((r) => r.name === 'editor.json'))
          }
        })
      } catch (e) {
        release(id)
        throw e
      }
    },

    async closeProject(dir) {
      if (typeof dir !== 'string' || !dir.startsWith(DIR_PREFIX)) return
      release(dir.slice(DIR_PREFIX.length))
    },

    async writeProjectFiles(dir, files) {
      const id = parseDir(dir)
      for (const f of files) {
        checkWritable(f.name)
        if (typeof f.text !== 'string') throw new Error(`파일 내용이 올바르지 않아요: ${f.name}`)
      }
      await tx(db, ['projects', 'files'], 'readwrite', async (t) => {
        await assertProject(t, id)
        await putFiles(
          t,
          id,
          files.map((f) => ({ name: f.name, data: f.text }))
        )
      })
    },

    async deleteProjectFiles(dir, names) {
      const id = parseDir(dir)
      for (const name of names) if (!isPlainName(name) || !isChartFileName(name)) throw disallowed(name)
      const lower = new Set(names.map((n) => n.toLowerCase()))
      await tx(db, ['projects', 'files'], 'readwrite', async (t) => {
        await assertProject(t, id)
        const store = t.objectStore('files')
        for (const existing of await namesOf(t, id)) {
          if (lower.has(existing.toLowerCase())) store.delete([id, existing])
        }
      })
    },

    async readAudio(path) {
      if (isPickedPath(path)) return getPicked(path).arrayBuffer()
      if (!path.startsWith(DIR_PREFIX)) throw new Error(BAD_DIR)
      const slash = path.indexOf('/')
      if (slash < 0) throw new Error(BAD_DIR)
      const id = parseDir(path.slice(0, slash))
      const name = path.slice(slash + 1)
      if (!isAudioFile(name)) throw new Error('오디오 파일(ogg, mp3, wav)만 읽을 수 있어요')
      const record = (await tx(db, ['files'], 'readonly', (t) => req(t.objectStore('files').get([id, name])))) as
        | FileRecord
        | undefined
      if (!record || !('blob' in record)) throw new Error('음악 파일을 찾을 수 없어요')
      return record.blob.arrayBuffer()
    },

    async importProjectAudio(dir, source) {
      const id = parseDir(dir)
      const file = pickedAudio(source)
      return tx(db, ['projects', 'files'], 'readwrite', async (t) => {
        await assertProject(t, id)
        const taken = new Set((await namesOf(t, id)).map((n) => n.toLowerCase()))
        const name = copiedAudioName(file.name, (n) => taken.has(n.toLowerCase()))
        t.objectStore('files').put({ projectId: id, name, blob: file })
        return name
      })
    },

    async getRecentProjects() {
      const loaded = await tx(db, ['projects', 'files'], 'readonly', async (t) => {
        const projects = (await req(t.objectStore('projects').getAll())) as { id: string; lastOpened: number }[]
        const out: { id: string; lastOpened: number; records: FileRecord[] }[] = []
        for (const p of projects) {
          const records = (await req(t.objectStore('files').getAll(rangeOf(p.id)))) as FileRecord[]
          out.push({ id: p.id, lastOpened: p.lastOpened, records })
        }
        return out
      })
      return loaded
        .map((p): RecentProject => {
          const song = textOf(p.records.find((r) => r.name === 'song.json'))
          const charts = p.records
            .filter((r) => isChartFileName(r.name) && 'text' in r)
            .map((r) => ({ file: r.name, text: textOf(r) as string }))
          try {
            if (song === null) throw new Error('no song')
            return { dir: dirOf(p.id), lastOpened: p.lastOpened, missing: false, ...summarizeProjectFiles(song, charts) }
          } catch {
            // 곡 파일이 깨져도 목록에는 남겨서 지울 수 있게 한다
            return { dir: dirOf(p.id), lastOpened: p.lastOpened, missing: false, title: '', artist: '', charts: [] }
          }
        })
        .sort((a, b) => b.lastOpened - a.lastOpened)
    },

    /**
     * 웹은 목록이 곧 저장소라 "목록에서 제거"가 곧 영구 삭제가 된다. 그래서 아무것도 지우지 않는다.
     * 지우기는 확인을 거치는 trashProjects("영구 삭제")로만 한다. 형식이 틀린 dir은 PC와 같이 거절한다.
     */
    async removeRecentProject(dir) {
      parseDir(dir)
    },

    async trashProjects(dirs) {
      const failed: TrashFailure[] = []
      for (const dir of dirs) {
        try {
          const id = parseDir(dir)
          if (held.has(id) || (await isLockedElsewhere(id))) {
            failed.push({ dir, error: BUSY })
            continue
          }
          await deleteProject(id)
        } catch (e) {
          failed.push({ dir, error: e instanceof Error ? e.message : String(e) })
        }
      }
      return failed
    },

    async addImported(files) {
      const byName = new Map<string, ImportedFile>()
      for (const f of files) {
        if (!isPlainName(f.name) || !isProjectFileName(f.name)) throw disallowed(f.name)
        byName.set(f.name.toLowerCase(), f)
      }
      const id = deps.uuid()
      const now = deps.now()
      await tx(db, ['projects', 'files'], 'readwrite', (t) => {
        t.objectStore('projects').put({ id, createdAt: now, lastOpened: now })
        const store = t.objectStore('files')
        for (const f of byName.values()) store.put(recordOf(id, f.name, f.data))
      })
      return { dir: dirOf(id) }
    },

    async listFiles(dir) {
      const id = parseDir(dir)
      return tx(db, ['projects', 'files'], 'readonly', async (t) => {
        await assertProject(t, id)
        const records = (await req(t.objectStore('files').getAll(rangeOf(id)))) as FileRecord[]
        return records.map((r): ImportedFile => ({ name: r.name, data: 'text' in r ? r.text : r.blob }))
      })
    }
  }
}
