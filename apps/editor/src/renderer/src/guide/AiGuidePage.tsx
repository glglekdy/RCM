import { Copy, Download, FileText, FolderInput, MessageSquareText } from 'lucide-react'
import chartFormatGuide from '../../../../../../docs/CHART_FORMAT_GUIDE.md?raw'
import { Button, useDialogs, useToast } from '../ui'
import styles from './GuidePage.module.css'

const GUIDE_FILE_NAME = 'CHART_FORMAT_GUIDE.md'

const EXAMPLE_PROMPT = `첨부한 ${GUIDE_FILE_NAME}는 RCM 채보 에디터가 만든 채보 파일 포맷과 타이밍 계산, 판정 규칙을 정리한 문서야.
이 문서를 먼저 끝까지 읽고, 그 규칙대로 곡 폴더(song.json, *.chart.json, 음악 파일)를 읽어서 노트가 떨어지는 리듬게임을 만들어 줘.`

/** 시작 화면의 `AI 가이드` 페이지: 게임 구현용 채보 포맷 문서를 AI에게 넘기는 방법. */
export function AiGuidePage() {
  const dialogs = useDialogs()
  const toast = useToast()

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(done)
    } catch {
      toast('클립보드에 복사하지 못했어요')
    }
  }

  const download = async () => {
    try {
      const path = await window.rcm.saveTextFile(GUIDE_FILE_NAME, chartFormatGuide)
      if (path) toast('가이드 파일을 저장했어요')
    } catch (err) {
      await dialogs.alert('파일을 저장할 수 없어요', err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>AI 가이드</h1>
        <p className={styles.lead}>
          이 에디터로 만든 채보를 게임에서 쓰려면, AI(Claude, ChatGPT, Cursor 등)에게 아래 가이드 문서를 함께 주세요.
          파일 구조, tick → ms 시간 계산 공식, 판정 규칙, 트랙 이름 해석 방법이 모두 들어 있어서 AI가 이 문서만 보고
          채보를 읽는 게임을 만들 수 있어요.
        </p>

        <section className={styles.section}>
          <h2>
            <FileText size={16} /> {GUIDE_FILE_NAME}
          </h2>
          <p className={styles.muted}>채보 포맷 & 리듬게임 구현 가이드 (AI 에이전트용)</p>
          <div className={styles.actions}>
            <Button variant="primary" onClick={() => void download()}>
              <Download size={16} /> 다운로드
            </Button>
            <Button onClick={() => void copy(chartFormatGuide, '가이드 내용을 복사했어요')}>
              <Copy size={16} /> 내용 복사
            </Button>
          </div>
        </section>

        <section className={styles.section}>
          <h2>
            <MessageSquareText size={16} /> 방법 1. 프롬프트에 넣기
          </h2>
          <ol className={styles.steps}>
            <li>위에서 가이드 파일을 다운로드하거나 내용을 복사해요.</li>
            <li>AI 채팅에 파일을 첨부하거나, 복사한 내용을 프롬프트에 붙여넣어요.</li>
            <li>만들고 싶은 게임을 설명하면서 가이드를 따르라고 요청해요. 예를 들면:</li>
          </ol>
          <pre className={styles.prompt}>{EXAMPLE_PROMPT}</pre>
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => void copy(EXAMPLE_PROMPT, '예시 프롬프트를 복사했어요')}>
              <Copy size={16} /> 예시 프롬프트 복사
            </Button>
          </div>
        </section>

        <section className={styles.section}>
          <h2>
            <FolderInput size={16} /> 방법 2. AI용 README 폴더에 넣기
          </h2>
          <p>
            Claude Code, Cursor, Codex처럼 프로젝트 폴더에서 일하는 AI 에이전트를 쓴다면, 게임 프로젝트 안에 AI가 읽는
            문서 폴더(예: <code>docs/</code>)를 두고 그 안에 가이드 파일을 넣어 두세요.
          </p>
          <ol className={styles.steps}>
            <li>
              가이드 파일을 다운로드해서 게임 프로젝트의 문서 폴더에 넣어요. 예:{' '}
              <code>내 게임/docs/{GUIDE_FILE_NAME}</code>
            </li>
            <li>
              AI가 항상 읽는 지침 파일(<code>CLAUDE.md</code>, <code>AGENTS.md</code>, <code>.cursorrules</code>{' '}
              등)이나 <code>README.md</code>에 &ldquo;채보 파일을 다룰 때는 <code>docs/{GUIDE_FILE_NAME}</code>를
              따른다&rdquo;라고 한 줄 적어 두면, 매번 첨부하지 않아도 AI가 알아서 참고해요.
            </li>
          </ol>
          <p className={styles.muted}>에디터를 업데이트하면 가이드도 바뀔 수 있으니, 새 버전에서 다시 받아 덮어써 주세요.</p>
        </section>

        <section className={styles.section}>
          <h2>
            <FileText size={16} /> 문서 미리보기
          </h2>
          <pre className={styles.preview}>{chartFormatGuide}</pre>
        </section>
      </div>
    </div>
  )
}
