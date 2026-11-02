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
