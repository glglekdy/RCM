import { describe, expect, it } from 'vitest'
import { buildReleaseNotes, tagMessage } from '../releaseNotes.mjs'

describe('releaseNotes', () => {
  it('feat·fix·perf만 종류별로 모은다', () => {
    const notes = buildReleaseNotes([
      'fix(editor): install updates only via restart, not on quit',
      'feat(editor): drag notes and hold ends on the timeline, music volume',
      'docs: gameplay layout implementation plan',
      'chore: release v0.3.0',
      'perf(playfield): skip offscreen notes',
      'feat: gameplay settings with live preview',
      'Merge branch main',
    ])
    expect(notes).toBe(
      [
        '## 새 기능',
        '',
        '- drag notes and hold ends on the timeline, music volume',
        '- gameplay settings with live preview',
        '',
        '## 버그 수정',
        '',
        '- install updates only via restart, not on quit',
        '',
        '## 성능 개선',
        '',
        '- skip offscreen notes',
      ].join('\n')
    )
  })

  it('보이는 변경이 없으면 한 줄로 알린다', () => {
    expect(buildReleaseNotes(['docs: x', 'chore: release v1.0.0'])).toBe(
      '- 내부 정리 (화면에 보이는 변경 없음)'
    )
  })

  it('태그 메시지: 태그 이름, 빈 줄, 내역', () => {
    expect(tagMessage('v0.4.0', '## 새 기능\n\n- a\n\n')).toBe('v0.4.0\n\n## 새 기능\n\n- a\n')
  })
})
