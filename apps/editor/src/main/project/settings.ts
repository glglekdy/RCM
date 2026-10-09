import { promises as fs } from 'node:fs'
import { writeFileAtomic } from './atomicWrite'

export interface RecentEntry {
  dir: string
  lastOpened: number
}

export interface Settings {
  recent: RecentEntry[]
  defaultProjectDir?: string
}

const MAX_RECENT = 20

export function touchRecent(list: RecentEntry[], dir: string, now: number): RecentEntry[] {
  return [{ dir, lastOpened: now }, ...list.filter((e) => e.dir !== dir)].slice(0, MAX_RECENT)
}

export async function loadSettings(file: string): Promise<Settings> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(file, 'utf8'))
    if (typeof raw !== 'object' || raw === null) return { recent: [] }
    const obj = raw as { recent?: unknown; defaultProjectDir?: unknown }
    const recent = Array.isArray(obj.recent)
      ? obj.recent.filter(
          (e): e is RecentEntry =>
            typeof e === 'object' &&
            e !== null &&
            typeof (e as RecentEntry).dir === 'string' &&
            typeof (e as RecentEntry).lastOpened === 'number'
        )
      : []
    const settings: Settings = { recent }
    if (typeof obj.defaultProjectDir === 'string') settings.defaultProjectDir = obj.defaultProjectDir
    return settings
  } catch {
    return { recent: [] }
  }
}

export async function saveSettings(file: string, s: Settings): Promise<void> {
  await writeFileAtomic(file, `${JSON.stringify(s, null, 2)}\n`)
}
