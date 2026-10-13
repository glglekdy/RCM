// 배포 스크립트(`npm run release -- X.Y.Z --notes …`)가 `notes/X.Y.Z.md`에 쓴 업데이트 내역을 앱에 함께 넣는다
const files = import.meta.glob<string>('./notes/*.md', { query: '?raw', import: 'default', eager: true })

/** 버전 → 업데이트 내역 (Markdown) */
export const RELEASE_NOTES: ReadonlyMap<string, string> = new Map(
  Object.entries(files).map(([file, text]) => [file.replace(/^.*\/|\.md$/g, ''), text.trim()])
)
