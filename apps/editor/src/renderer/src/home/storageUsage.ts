export function formatUsage(bytes: number): string {
  const mb = bytes / 1024 / 1024
  return mb < 1 ? '사용 중 1MB 미만' : `사용 중 ${Math.round(mb)}MB`
}

interface StorageNav {
  storage?: { estimate?: () => Promise<{ usage?: number }> }
}

export async function readStorageUsage(nav: StorageNav = navigator): Promise<string | null> {
  try {
    const est = await nav.storage?.estimate?.()
    return typeof est?.usage === 'number' ? formatUsage(est.usage) : null
  } catch {
    return null
  }
}
