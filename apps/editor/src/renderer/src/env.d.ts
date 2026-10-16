/// <reference types="vite/client" />
import '../../shared/api'

declare global {
  /** AI 가이드 문서(CHART_FORMAT_GUIDE.md)를 마지막으로 고친 시각 (ISO). 빌드할 때 git 기록에서 넣는다 */
  const __AI_GUIDE_UPDATED_AT__: string
}
