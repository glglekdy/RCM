interface EnterKeyEvent {
  key: string
  keyCode: number
  nativeEvent: { isComposing: boolean }
}

/** 제출로 볼 Enter인지. 한글 등 IME 조합을 끝내는 Enter는 제외한다. */
export function isSubmitEnter(e: EnterKeyEvent): boolean {
  return e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229
}
