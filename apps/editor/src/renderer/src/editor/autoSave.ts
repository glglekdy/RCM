export interface AutoSaveOpts {
  enabled: boolean
  hidden: boolean
  dirty: boolean
  save: () => Promise<void>
  onError: (err: unknown) => void
}

/** 화면이 가려질 때 저장하지 않은 변경이 있으면 저장한다. 저장을 시도했으면 true. 오류는 onError로 넘긴다. */
export async function autoSaveOnHidden(opts: AutoSaveOpts): Promise<boolean> {
  if (!opts.enabled || !opts.hidden || !opts.dirty) return false
  try {
    await opts.save()
  } catch (err) {
    opts.onError(err)
  }
  return true
}
