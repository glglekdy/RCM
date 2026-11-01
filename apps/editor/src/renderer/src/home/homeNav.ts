import { BookOpen, Bot, House, Settings, SlidersHorizontal, type LucideIcon } from 'lucide-react'

export type Page = 'home' | 'presets' | 'userGuide' | 'aiGuide' | 'settings'

/** 홈 화면의 이동 항목 (사이드바와 폰의 떠 있는 탭 바가 같은 목록을 쓴다) */
export const NAV: { page: Page; icon: LucideIcon; label: string }[] = [
  { page: 'home', icon: House, label: '홈' },
  { page: 'presets', icon: SlidersHorizontal, label: '트랙 프리셋' },
  { page: 'userGuide', icon: BookOpen, label: '유저 가이드' },
  { page: 'aiGuide', icon: Bot, label: 'AI 가이드' },
  { page: 'settings', icon: Settings, label: '설정' }
]
