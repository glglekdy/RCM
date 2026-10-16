// 배포판 사용자에게 그대로 전달된다. 저장소 경로·비공개 패키지를 가리키지 않게 테스트로 지킨다 (test/shared/chartFormatGuide.test.ts)
import chartFormatGuide from '../../../../../../docs/CHART_FORMAT_GUIDE.md?raw'
import { guideNoticeId } from './guideNotice'

export { chartFormatGuide }

/** 이 가이드 내용을 아직 확인하지 않았으면 홈 사이드바의 `AI 가이드` 옆에 알림을 띄운다 */
export const AI_GUIDE_NOTICE_ID = guideNoticeId(chartFormatGuide)
