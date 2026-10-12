import { Fragment, type ReactNode } from 'react'
import {
  AudioLines,
  Gamepad2,
  Keyboard,
  MousePointer2,
  Music,
  Rows3,
  Rocket,
  Save,
  TriangleAlert
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import styles from './GuidePage.module.css'

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2>
        <Icon size={16} /> {title}
      </h2>
      {children}
    </section>
  )
}

const SHORTCUTS: [string[], string][] = [
  [['Space'], '재생 / 정지'],
  [['B'], '그리기 도구'],
  [['E'], '지우기 도구'],
  [['V'], '선택 도구'],
  [['1', '~', '6'], '스냅 1/4 · 1/8 · 1/12 · 1/16 · 1/24 · 1/32'],
  [['Ctrl', 'Z'], '되돌리기 (Ctrl+Y 또는 Ctrl+Shift+Z로 다시 실행)'],
  [['Ctrl', 'C'], '복사 (Ctrl+X 잘라내기, Ctrl+V 재생선 위치에 붙여넣기)'],
  [['Ctrl', 'H'], '선택한 노트 좌우 반전'],
  [['Delete'], '선택한 노트 삭제'],
  [['T'], '탭 BPM (재생 중 박자에 맞춰 누르기)'],
  [['M'], '가이드 마커 추가'],
  [['[', ']'], '이전 / 다음 마커로 이동'],
  [['R'], '실시간 녹음'],
  [['F5'], '재생선부터 테스트 플레이 (Shift+F5는 처음부터, 플레이 중엔 다시 시작)'],
  [['F4'], '테스트 플레이 중 자동 플레이 켜기 · 끄기'],
  [['Esc'], '정지 · 녹음 끝내기 · 테스트 플레이 나가기'],
  [['Ctrl', 'S'], '저장'],
  [['Ctrl', '휠'], '타임라인 확대 / 축소']
]

/** 시작 화면의 `유저 가이드` 페이지: 에디터 기능 소개. */
export function UserGuidePage() {
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={styles.disclaimer} role="alert">
          <h2>
            <TriangleAlert size={16} /> 저작권 및 법적 책임 안내
          </h2>
          <p>
            RCM 채보 에디터는 <b>채보를 제작하는 도구</b>입니다. 에디터에서 불러오거나 사용하는 음악 · 이미지 등 모든
            콘텐츠의 저작권 확인 및 이용 허락은 <b>전적으로 사용자 본인의 책임</b>입니다.
          </p>
          <p>
            저작권이 있는 콘텐츠의 사용 및 이를 이용해 제작한 채보의 배포로 발생하는 모든 저작권 관련 문제에 대해
            개발자는 <b>법적 책임을 일절 지지 않습니다.</b>
          </p>
        </div>

        <h1 className={styles.title}>유저 가이드</h1>
        <p className={styles.lead}>
          RCM 채보 에디터는 세로 레인형 리듬게임의 채보를 만드는 도구예요. 음악을 불러와 박자를 맞추고, 노트를 찍고,
          바로 테스트 플레이로 확인할 수 있어요.
        </p>

        <Section icon={Rocket} title="시작하기">
          <ol className={styles.steps}>
            <li>
              <b>새 프로젝트</b>를 눌러 곡 제목, 음악 파일(ogg · mp3 · wav), BPM, 첫 난이도 이름과 트랙 프리셋을
              정해요. BPM을 모르면 일단 아무 값으로 만들고 나중에 탭 BPM으로 잡으면 돼요.
            </li>
            <li>
              곡 하나는 폴더 하나로 저장돼요. 음악 파일도 폴더 안으로 복사되니 폴더째 옮기면 돼요.
            </li>
            <li>
              이미 있는 곡은 <b>프로젝트 열기</b>로 폴더를 고르거나, 홈의 최근 프로젝트 목록에서 더블클릭해서 열어요.
              목록에서 우클릭하면 탐색기에서 보기 · 목록에서 제거를 할 수 있어요.
            </li>
          </ol>
        </Section>

        <Section icon={Rows3} title="편집 화면 구성">
          <ul>
            <li>
              <b>가운데 타임라인</b>: 아래에서 위로 시간이 흘러요 (게임과 같은 방향). 왼쪽에 파형, 마디선 · 박선,
              BPM 변경 지점과 가이드 마커가 함께 보여요. 마우스 휠로 스크롤, Ctrl+휠로 확대해요.
            </li>
            <li>
              <b>미니맵</b>: 타임라인 오른쪽 띠에 곡 전체가 축소돼 보여요. 클릭하면 그 위치로 이동하고, 보이는 범위
              상자를 끌어서 스크롤할 수 있어요.
            </li>
            <li>
              <b>오른쪽 패널</b>: <code>곡</code>(제목 · 아티스트 · 오프셋 · 미리듣기 시작 · 효과음 볼륨),{' '}
              <code>타이밍</code>(BPM 변경 지점 · 탭 BPM 결과 · 가이드 마커), <code>채보</code>(난이도 이름 · 레벨 ·
              트랙) 세 탭이 있어요.
            </li>
            <li>
              <b>하단 툴바</b>: 난이도 탭과 난이도 추가, 도구, 스냅, 확대 비율, 재생 · 녹음 · 테스트 플레이, 파일
              메뉴(새 프로젝트 · 열기 · 저장 · 홈으로)가 있어요.
            </li>
          </ul>
        </Section>

        <Section icon={MousePointer2} title="노트 찍기">
          <ul>
            <li>
              <b>그리기 (B)</b>: 클릭하면 스냅 위치에 탭 노트, 클릭한 채 위로 끌면 롱노트(hold)가 돼요. 우클릭하거나
              우클릭한 채 끌면 노트를 지워요.
            </li>
            <li>
              <b>지우기 (E)</b>: 클릭하거나 끌고 지나가는 노트를 지워요.
            </li>
            <li>
              <b>선택 (V)</b>: 끌어서 범위 선택, Shift+클릭으로 추가 선택. 선택한 노트를 끌면 다른 위치 · 다른
              트랙으로 옮겨요. 복사 · 붙여넣기 · 좌우 반전 · 삭제도 선택한 노트에 적용돼요.
            </li>
            <li>
              <b>스냅</b>은 노트가 붙는 간격이에요. 1/4이 한 박(4분음표)이고, 숫자키 1~6이나 툴바에서 바꿔요.
            </li>
            <li className={styles.muted}>겹치는 자리에는 노트가 놓이지 않아요. 모든 편집은 Ctrl+Z로 되돌릴 수 있어요.</li>
          </ul>
        </Section>

        <Section icon={Music} title="박자 맞추기">
          <ul>
            <li>
              <b>오프셋</b>: 음악 파일에서 첫 박이 나오는 시각(ms)이에요. 곡 탭에서 직접 입력하거나 ±1 · ±10 버튼으로
              조절해요.
            </li>
            <li>
              <b>탭 BPM</b>: 재생하면서 <kbd>T</kbd>를 박자에 맞춰 4번 이상 누르면 타이밍 탭에 BPM과 첫 박 위치가
              계산돼요. <code>곡 전체에 적용</code> 또는 <code>이 지점부터 적용</code>으로 반영해요.
            </li>
            <li>
              <b>BPM 변경</b>: 타이밍 탭에서 재생선 위치에 BPM 변경 지점을 추가하고, BPM과 박자 수를 고쳐요. 타이밍을
              바꿔도 노트는 박자 위치를 유지해요.
            </li>
            <li>
              <b>가이드 마커</b>: 재생 중 <kbd>M</kbd>을 누르면 그 순간에 점선 표시가 생겨요. 후렴 시작처럼 기억해 둘
              곳에 찍고, <kbd>[</kbd> <kbd>]</kbd>로 오가요. 우클릭하면 지워요.
            </li>
          </ul>
        </Section>

        <Section icon={AudioLines} title="트랙과 프리셋">
          <ul>
            <li>
              채보는 이름이 붙은 트랙(<code>Note_1</code>, <code>Side_L</code> 등)으로 이뤄져요. 채보 탭에서 트랙을
              추가 · 삭제하고, 이름 · 색 · 종류(플레이 · 기믹)를 바꾸고, 손잡이를 끌어 순서를 바꿔요. 기믹 트랙은 톱니바퀴
              같은 장애물처럼 게임이 해석할 데이터용이라 키가 없고 판정하지 않아요.
            </li>
            <li>
              <b>트랙 프리셋</b>은 자주 쓰는 트랙 구성과 키 배치를 저장해 둔 것이에요. 새 프로젝트나 난이도를 만들 때
              고르고, 왼쪽 <code>트랙 프리셋</code> 메뉴에서 관리해요. 채보 탭의 <code>프리셋으로 저장</code>으로 지금
              트랙을 프리셋으로 만들 수도 있어요. <code>새 프리셋</code>을 누르면 빈 프리셋이나 DJMAX · EZ2ON · Muse
              Dash · osu!mania 배치를 골라 시작할 수 있어요.
            </li>
            <li className={styles.muted}>
              녹음 · 테스트 플레이의 키는 트랙 이름이 같은 프리셋의 키를 쓰고, 없으면 A S D F J K L ; … 순서로 자동
              배정돼요. 5K · 7K의 가운데 트랙처럼 한 트랙을 두 키로 치고 싶으면 프리셋에서 <b>보조 키</b>를 지정하세요.
              두 키 중 아무거나 눌러도 그 트랙이 눌리고, 두 키를 모두 떼야 뗀 것으로 쳐요.
            </li>
          </ul>
        </Section>

        <Section icon={Gamepad2} title="녹음과 테스트 플레이">
          <ul>
            <li>
              <b>실시간 녹음 (R)</b>: 음악에 맞춰 트랙 키를 누르면 노트가 기록돼요. 정지(<kbd>Esc</kbd>)하면 현재
              스냅에 맞춰 정리되고, 스냅 한 칸 이상 누른 키는 롱노트가 돼요. 기존 노트와 겹치면 기존 노트를 남겨요.
            </li>
            <li>
              <b>테스트 플레이 (F5)</b>: 재생선 위치부터 실제 게임처럼 플레이하며 판정과 콤보를 확인해요.{' '}
              <kbd>Shift+F5</kbd>는 처음부터, <kbd>↑</kbd> <kbd>↓</kbd>로 노트 속도를 바꿔요. 플레이 중{' '}
              <kbd>F5</kbd>를 누르면 같은 위치에서 다시 시작하고, <kbd>F4</kbd>로 자동 플레이를 켜고 끌 수 있어요. 곡이
              끝나도 결과가 남아 있고, <kbd>Esc</kbd>로 돌아와요.
            </li>
          </ul>
        </Section>

        <Section icon={Save} title="저장">
          <ul>
            <li>
              <kbd>Ctrl+S</kbd>로 바뀐 파일만 저장해요. 저장하지 않은 변경이 있으면 제목 옆에 <code>*</code>가 붙고,
              창을 닫거나 홈으로 갈 때 저장할지 물어봐요.
            </li>
            <li>
              폴더 안에는 <code>song.json</code>(곡 정보 · 타이밍), 난이도마다 <code>이름.chart.json</code>, 에디터
              전용 <code>editor.json</code>, 음악 파일이 들어 있어요. 게임에서 이 파일을 읽는 방법은{' '}
              <b>AI 가이드</b> 메뉴를 참고하세요.
            </li>
          </ul>
        </Section>

        <Section icon={Keyboard} title="단축키">
          <dl className={styles.keys}>
            {SHORTCUTS.map(([keys, desc]) => (
              <Fragment key={desc}>
                <dt>
                  {keys.map((k) => (k === '~' ? <span key={k}>~</span> : <kbd key={k}>{k}</kbd>))}
                </dt>
                <dd>{desc}</dd>
              </Fragment>
            ))}
          </dl>
        </Section>
      </div>
    </div>
  )
}
