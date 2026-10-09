// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f]/g

export function sanitizeFolderName(name: string): string {
  const cleaned = name.replace(FORBIDDEN, '_').trim().replace(/\.+$/, '').trim()
  return cleaned === '' ? 'untitled' : cleaned
}

export function uniqueChildName(name: string, exists: (candidate: string) => boolean): string {
  if (!exists(name)) return name
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`
    if (!exists(candidate)) return candidate
  }
}
