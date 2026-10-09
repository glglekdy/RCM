export interface RcmApi {
  minimize(): void
  toggleMaximize(): void
  close(): void
  isMaximized(): Promise<boolean>
}

declare global {
  interface Window {
    rcm: RcmApi
  }
}
