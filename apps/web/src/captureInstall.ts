// installApi의 top-level await 동안 온 이벤트도 놓치지 않도록 가장 먼저 평가된다
type Prompt = { prompt(): Promise<unknown> }
let early: Prompt | null = null
let sink: ((e: Prompt | null) => void) | null = null

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  if (sink) sink(e as unknown as Prompt)
  else early = e as unknown as Prompt
})
window.addEventListener('appinstalled', () => {
  early = null
  sink?.(null)
})

export function connectInstallPrompt(set: (e: Prompt | null) => void): void {
  sink = set
  if (early) set(early)
  early = null
}
