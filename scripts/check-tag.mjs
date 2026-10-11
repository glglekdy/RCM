import { readFileSync } from 'node:fs'
import { tagFor } from './version.mjs'

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME
const pkgUrl = new URL('../apps/editor/package.json', import.meta.url)
const { version } = JSON.parse(readFileSync(pkgUrl, 'utf8'))

if (tag !== tagFor(version)) {
  console.error(`태그 ${tag}와 앱 버전 ${version}이 달라요`)
  process.exit(1)
}
console.log(`태그 ${tag} 확인`)
