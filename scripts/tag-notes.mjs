// 사용법: node scripts/tag-notes.mjs <태그> <저장할 파일>
// 주석 태그 메시지에서 첫 줄(태그 이름)을 뺀 업데이트 내역을 UTF-8 파일로 저장한다 (Release 본문용).
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const [tag, out] = process.argv.slice(2)
if (!tag || !out) {
  console.error('사용법: node scripts/tag-notes.mjs <태그> <저장할 파일>')
  process.exit(1)
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })
// 업데이트 내역이 없다고 배포를 막지는 않는다: 빈 본문으로 두고 Actions 경고만 남긴다
if (git('cat-file', '-t', `refs/tags/${tag}`).trim() !== 'tag') {
  writeFileSync(out, ' ')
  console.log(`::warning::${tag}는 주석 태그가 아니라 업데이트 내역을 읽지 못했어요`)
  process.exit(0)
}
const notes = git('tag', '--list', '--format=%(contents:body)', tag).trim()
writeFileSync(out, notes === '' ? ' ' : `${notes}\n`)
console.log(notes === '' ? `${tag}에 업데이트 내역이 없어요` : `${tag} 업데이트 내역\n\n${notes}`)
