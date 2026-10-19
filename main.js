// 다운로드 버튼: 최신 Release의 설치 파일을 바로 받게 한다.
// 조회에 실패하면 버튼은 HTML에 적힌 Release 페이지 링크 그대로 둔다.
const RELEASE_API = 'https://api.github.com/repos/glglekdy/RCM/releases/latest'
const CACHE_KEY = 'rcm-latest-release'

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeCache(info) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(info))
  } catch {
    // 저장소를 못 쓰면 다음에 다시 조회한다
  }
}

async function fetchLatest() {
  const res = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  const release = await res.json()
  const exe = (release.assets || []).find((a) => /\.exe$/i.test(a.name))
  if (!exe) throw new Error('설치 파일이 없는 Release')
  return { url: exe.browser_download_url, version: release.tag_name, size: exe.size }
}

function applyRelease(info) {
  document.querySelectorAll('[data-download]').forEach((a) => {
    a.href = info.url
  })
  const version = document.querySelector('[data-version]')
  if (version) {
    version.textContent = info.version
    version.hidden = false
  }
  const size = document.querySelector('[data-size]')
  if (size && info.size) {
    size.textContent = `${Math.round(info.size / 1048576)} MB`
    size.hidden = false
  }
}

async function setupDownload() {
  const cached = readCache()
  if (cached) {
    applyRelease(cached)
    return
  }
  try {
    const info = await fetchLatest()
    writeCache(info)
    applyRelease(info)
  } catch (err) {
    console.warn('최신 버전을 불러오지 못해 Release 페이지로 연결합니다.', err)
  }
}

// 히어로 플레이필드: 흰 노트가 판정선으로 떨어지는 오토 플레이 화면
function setupPlayfield() {
  const canvas = document.getElementById('playfield')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  const LANES = 6
  const BEAT = 60 / 150
  const LOOP = 16 // 박
  const TRAVEL = 0.9 // 노트가 판정선까지 내려오는 시간(초)

  // [박 위치, 레인, 롱노트 길이(박)]
  const pattern = []
  const stair = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0, 2, 4, 1, 3, 5]
  for (let i = 0; i < LOOP * 2; i++) {
    const beat = i / 2
    if (beat >= 12 && beat < 14) continue
    pattern.push([beat, stair[i % stair.length], 0])
    if (i % 4 === 2) pattern.push([beat, (stair[i % stair.length] + 3) % LANES, 0])
  }
  pattern.push([12, 0, 1.5], [12, 5, 1.5], [13.5, 2, 0], [13.5, 3, 0])
  // 롱노트가 덮는 구간의 탭은 뺀다
  const holds = pattern.filter((n) => n[2] > 0)
  const notes = pattern.filter(
    (n) => n[2] > 0 || !holds.some((h) => h[1] === n[1] && n[0] > h[0] && n[0] <= h[0] + h[2])
  )

  const button = document.getElementById('hero-download')
  function pulseButton() {
    if (!button) return
    button.classList.remove('beat')
    void button.offsetWidth // 애니메이션을 처음부터 다시 시작
    button.classList.add('beat')
  }

  const flash = new Float32Array(LANES)
  let combo = 0
  let width = 0
  let height = 0
  let start = performance.now()
  let lastBeat = -1
  let running = false
  let visible = true
  let frame = 0

  function resize() {
    // 등장 애니메이션의 scale에 영향받지 않는 레이아웃 크기를 쓴다
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    width = canvas.clientWidth
    height = canvas.clientHeight
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    ctx.fill()
  }

  function draw(songBeat, dt) {
    const fieldW = Math.min(width, 340)
    const left = (width - fieldW) / 2
    const laneW = fieldW / LANES
    const judgeY = height * 0.84
    const pxPerBeat = (judgeY / TRAVEL) * BEAT

    ctx.clearRect(0, 0, width, height)

    // 레인 구분선
    ctx.fillStyle = '#1d1d1d'
    for (let i = 0; i <= LANES; i++) ctx.fillRect(Math.round(left + i * laneW), 0, 1, height)

    // 판정 순간의 레인 빛
    for (let i = 0; i < LANES; i++) {
      flash[i] = Math.max(0, flash[i] - dt * 6)
      if (flash[i] <= 0) continue
      const glow = height * 0.28
      const g = ctx.createLinearGradient(0, judgeY, 0, judgeY - glow)
      g.addColorStop(0, `rgba(255,255,255,${0.2 * flash[i]})`)
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(left + i * laneW + 1, judgeY - glow, laneW - 1, glow)
    }

    const loopIndex = Math.floor(songBeat / LOOP)
    const padX = laneW * 0.1
    for (let k = loopIndex - 1; k <= loopIndex + 1; k++) {
      for (const [beat, lane, length] of notes) {
        const head = beat + k * LOOP
        const tail = head + length
        // 판정 처리: 이번 프레임에 판정선을 지난 노트
        if (head > lastBeat && head <= songBeat && lastBeat >= 0) {
          flash[lane] = 1
          combo++
        }
        if (length > 0 && head <= songBeat && tail > songBeat) flash[lane] = 1

        const yTail = judgeY - (tail - songBeat) * pxPerBeat
        const yHead = judgeY - (Math.max(head, songBeat) - songBeat) * pxPerBeat
        if (tail < songBeat || yTail > height || yHead < -40) continue
        if (length === 0 && head < songBeat) continue
        const x = left + lane * laneW + padX
        const w = laneW - padX * 2

        if (length > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.22)'
          roundRect(x + w * 0.12, yTail, w * 0.76, yHead - yTail, 3)
        } else {
          // 아이콘처럼 노트 위로 옅은 꼬리
          const trail = ctx.createLinearGradient(0, yHead - 56, 0, yHead)
          trail.addColorStop(0, 'rgba(255,255,255,0)')
          trail.addColorStop(1, 'rgba(255,255,255,0.1)')
          ctx.fillStyle = trail
          ctx.fillRect(x + 3, yHead - 56, w - 6, 56)
        }
        ctx.fillStyle = '#ffffff'
        roundRect(x, yHead - 5, w, 10, 3)
      }
    }

    // 판정선
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(left, judgeY - 1, fieldW, 2)

    // 위쪽은 배경으로 녹아들게
    const fade = ctx.createLinearGradient(0, 0, 0, height * 0.3)
    fade.addColorStop(0, '#000000')
    fade.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = fade
    ctx.fillRect(0, 0, width, height * 0.3)
    const fadeBottom = ctx.createLinearGradient(0, judgeY + 2, 0, height)
    fadeBottom.addColorStop(0, 'rgba(0,0,0,0)')
    fadeBottom.addColorStop(1, '#000000')
    ctx.fillStyle = fadeBottom
    ctx.fillRect(0, judgeY + 2, width, height - judgeY - 2)

    // 마디가 바뀔 때 다운로드 버튼에 링을 띄운다
    if (lastBeat >= 0 && Math.floor(songBeat / 4) > Math.floor(lastBeat / 4)) pulseButton()

    // 콤보
    if (combo > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.14)'
      ctx.textAlign = 'center'
      ctx.font = `900 ${Math.round(fieldW * 0.2)}px 'Pretendard Variable', Pretendard, sans-serif`
      ctx.fillText(String(combo), width / 2, height * 0.5)
      ctx.font = `700 ${Math.round(fieldW * 0.045)}px 'Pretendard Variable', Pretendard, sans-serif`
      ctx.fillText('COMBO', width / 2, height * 0.5 + fieldW * 0.075)
    }
    lastBeat = songBeat
  }

  let prev = performance.now()
  function tick(now) {
    const dt = Math.min(0.05, (now - prev) / 1000)
    prev = now
    draw((now - start) / 1000 / BEAT, dt)
    frame = requestAnimationFrame(tick)
  }

  function play() {
    if (running || reduceMotion.matches || !visible || document.hidden) return
    running = true
    // 멈춰 있던 동안 지나간 노트를 한꺼번에 판정하지 않게
    lastBeat = -1
    prev = performance.now()
    frame = requestAnimationFrame(tick)
  }

  function pause() {
    if (!running) return
    running = false
    cancelAnimationFrame(frame)
  }

  function drawStill() {
    lastBeat = -1
    draw(5.25, 0)
  }

  resize()
  if (reduceMotion.matches) drawStill()
  else start = performance.now() - TRAVEL * 1000

  new ResizeObserver(() => {
    resize()
    if (!running) drawStill()
  }).observe(canvas)

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    if (visible) play()
    else pause()
  }).observe(canvas)

  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()))
  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) {
      pause()
      drawStill()
    } else {
      play()
    }
  })
  play()
}

// 스크롤 모션: 나타나기, 대표 스크린샷 기울기, 스크린샷 시차, 게임 이름 띠
function setupMotion() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const selectors = [
    '.feature-copy > *',
    '.feature .shot',
    '.extras h2',
    '.extras article',
    '.install h2',
    '.steps li',
    '.final h2',
    '.final .btn-download'
  ]
  const targets = [...document.querySelectorAll(selectors.join(','))]
  targets.forEach((el) => el.classList.add('reveal'))
  // 같은 부모 안에서 순서대로 조금씩 늦게 나타나게
  targets.forEach((el) => {
    const siblings = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'))
    el.style.setProperty('--i', String(siblings.indexOf(el)))
  })
  document.querySelectorAll('.points').forEach((list) => {
    ;[...list.children].forEach((li, i) => li.style.setProperty('--i', String(i)))
  })

  if (reduceMotion || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('in'))
    return
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('in')
        observer.unobserve(entry.target)
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.15 }
  )
  targets.forEach((el) => observer.observe(el))

  const heroShot = document.querySelector('.shot-hero')
  const featureShots = [...document.querySelectorAll('.feature .shot')]
  const track = document.querySelector('.ticker-track')
  const group = track && track.querySelector('.ticker-group')

  // 띠가 화면보다 두 배 넘게 길어지도록 묶음을 복제한다
  let groupWidth = 0
  function fillTicker() {
    if (!track || !group) return
    groupWidth = group.getBoundingClientRect().width
    const needed = Math.ceil((window.innerWidth * 2) / groupWidth) + 1
    while (track.children.length < needed) track.appendChild(group.cloneNode(true))
  }
  fillTicker()
  window.addEventListener('resize', fillTicker)
  if (document.fonts) document.fonts.ready.then(fillTicker)

  let tickerX = 0
  let lastScroll = window.scrollY
  let velocity = 0
  let prev = performance.now()

  function frame(now) {
    const dt = Math.min(0.05, (now - prev) / 1000)
    prev = now
    const vh = window.innerHeight

    // 스크롤 속도: 아래로 내리면 띠가 빨라지고, 올리면 거꾸로 흐른다
    const scroll = window.scrollY
    const instant = dt > 0 ? (scroll - lastScroll) / dt : 0
    lastScroll = scroll
    velocity += (instant - velocity) * Math.min(1, dt * 8)

    if (heroShot) {
      const top = heroShot.getBoundingClientRect().top
      const tilt = Math.min(1, Math.max(0, (top - vh * 0.15) / (vh * 0.75)))
      heroShot.style.setProperty('--tilt', tilt.toFixed(4))
    }

    for (const shot of featureShots) {
      const rect = shot.getBoundingClientRect()
      if (rect.bottom < 0 || rect.top > vh) continue
      const offset = (rect.top + rect.height / 2 - vh / 2) / vh
      shot.style.setProperty('--shift', `${(offset * -36).toFixed(2)}px`)
    }

    if (track && groupWidth > 0) {
      const speed = 70 + Math.max(-900, Math.min(900, velocity * 0.45))
      tickerX = (tickerX - speed * dt) % groupWidth
      if (tickerX > 0) tickerX -= groupWidth
      track.style.transform = `translate3d(${tickerX.toFixed(2)}px, 0, 0)`
    }

    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

setupDownload()
setupPlayfield()
setupMotion()
