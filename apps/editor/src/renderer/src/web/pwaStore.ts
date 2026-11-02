import { useSyncExternalStore } from 'react'

export type InstallPrompt = { prompt(): Promise<unknown> }

let installPrompt: InstallPrompt | null = null
const listeners = new Set<() => void>()

export function setInstallPrompt(e: InstallPrompt | null): void {
  installPrompt = e
  listeners.forEach((l) => l())
}

export function getInstallPrompt(): InstallPrompt | null {
  return installPrompt
}

export function useInstallPrompt(): InstallPrompt | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getInstallPrompt
  )
}

export function installNoticeKind(env: {
  pc: boolean
  standalone: boolean
  ios: boolean
  canPrompt: boolean
}): 'prompt' | 'ios' | null {
  if (env.pc || env.standalone) return null
  if (env.canPrompt) return 'prompt'
  if (env.ios) return 'ios'
  return null
}

export function isIos(ua: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && maxTouchPoints > 1)
}

export type ApplyUpdate = (reload: boolean) => Promise<void>

let updateReady: ApplyUpdate | null = null
const updateListeners = new Set<() => void>()

export function setUpdateReady(apply: ApplyUpdate | null): void {
  updateReady = apply
  updateListeners.forEach((l) => l())
}

export function subscribeUpdateReady(l: () => void): () => void {
  updateListeners.add(l)
  return () => {
    updateListeners.delete(l)
  }
}

export function getUpdateReady(): ApplyUpdate | null {
  return updateReady
}

export function useUpdateReady(): ApplyUpdate | null {
  return useSyncExternalStore(subscribeUpdateReady, getUpdateReady)
}

/** 저장에 성공했을 때만 새 버전으로 새로고침한다 */
export async function applyUpdate(deps: {
  save: () => Promise<void>
  update: ApplyUpdate
  onError: (err: unknown) => void
}): Promise<void> {
  try {
    await deps.save()
  } catch (err) {
    deps.onError(err)
    return
  }
  await deps.update(true)
}
