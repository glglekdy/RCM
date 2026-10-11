import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { compareVersions, isValidVersion, tagFor } from './version.mjs'

const fail = (msg) => {
  console.error(msg)
  process.exit(1)
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })

const next = process.argv[2]
if (!isValidVersion(next)) {
  fail(`버전 형식이 올바르지 않아요: ${next ?? '(없음)'} (예: 0.1.0)`)
}

const pkgUrl = new URL('../apps/editor/package.json', import.meta.url)
const current = JSON.parse(readFileSync(pkgUrl, 'utf8')).version
if (compareVersions(next, current) <= 0) {
  fail(`새 버전 ${next}은 현재 버전 ${current}보다 커야 해요`)
}

if (git('status', '--porcelain').trim() !== '') {
  fail('커밋 안 된 변경이 있어요. 먼저 커밋하거나 되돌려 주세요')
}

const tag = tagFor(next)
if (git('tag', '--list', tag).trim() !== '') {
  fail(`태그 ${tag}가 이미 있어요`)
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
execFileSync(npm, ['version', next, '-w', '@rcm/editor', '--no-git-tag-version'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
git('add', 'apps/editor/package.json', 'package-lock.json')
git('commit', '-m', `chore: release ${tag}`)
git('tag', '-a', tag, '-m', tag)

console.log(`${tag} 커밋과 태그를 만들었어요`)
console.log('다음 명령으로 배포하세요: git push --follow-tags')
