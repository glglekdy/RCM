import 'pretendard/dist/web/variable/pretendardvariable.css'
import './styles/tokens.css'
import './styles/global.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

// 창에 파일을 끌어다 놓아도 브라우저 기본 동작(그 파일로 이동)을 하지 않는다
for (const type of ['dragover', 'drop'] as const) {
  document.addEventListener(type, (e) => e.preventDefault())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
