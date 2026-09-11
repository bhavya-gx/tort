import { sprite, leaf, water, bubble as bubbleSvg } from './sprite.js'
import { MOTION, LINES, AFFIRMATIONS } from './config.js'

const el = {
  pet: document.getElementById('pet'),
  sprite: document.getElementById('sprite'),
  bubble: document.getElementById('bubble'),
  hearts: document.getElementById('hearts'),
  leaf: document.getElementById('leaf'),
  water: document.getElementById('water'),
  bubbles: document.getElementById('bubbles')
}

el.sprite.innerHTML = sprite

/* ---------- dialogue ---------- */

const { ambient: AMBIENT, click: ON_CLICK, summon: ON_SUMMON, wake: ON_WAKE } = LINES

const pick = (list) => list[Math.floor(Math.random() * list.length)]
const rand = (min, max) => min + Math.random() * (max - min)

/* ---------- state ---------- */

const { width: WIDTH, height: HEIGHT, speed: SPEED, edge: EDGE } = MOTION

const state = {
  x: 0,
  target: null,
  mode: 'idle', // idle | walk | happy | sleep
  cursor: { x: -1, y: -1 },
  interactive: false,
  asleep: false,
  lastActivity: Date.now(),
  paused: false,
  // The three daily care tasks. Reset at local midnight.
  day: localDay(),
  care: { petted: false, studied: false, walked: false, done: false },
  lastCaredAt: 0,
  affirmedToday: new Set(),
  // Drag to move
  dragging: false,
  dragMoved: false,
  dragStartX: 0,
  dragLastX: 0
}

function localDay (d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

let bounds = { w: window.innerWidth, h: window.innerHeight }

function measure () {
  bounds = { w: window.innerWidth, h: window.innerHeight }
  state.x = clamp(state.x)
  draw()
}

const clamp = (x) => Math.max(EDGE, Math.min(x, bounds.w - WIDTH - EDGE))

function setMode (mode) {
  state.mode = mode
  el.pet.dataset.state = mode
}

function draw () {
  el.pet.style.transform = `translate3d(${state.x}px, 0, 0)`
}

/* ---------- movement ---------- */

function walkTo (x, then) {
  state.target = { x: clamp(x), then }
  el.pet.dataset.facing = state.target.x < state.x ? 'left' : 'right'
  setMode('walk')
}

let lastFrame = performance.now()

function frame (now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.1)
  lastFrame = now

  if (state.target) {
    const dx = state.target.x - state.x
    const step = SPEED * dt
    if (Math.abs(dx) <= step) {
      state.x = state.target.x
      const then = state.target.then
      state.target = null
      setMode(state.asleep ? 'sleep' : 'idle')
      if (then) then()
    } else {
      state.x += Math.sign(dx) * step
    }
    draw()
  }

  updateHover()
  requestAnimationFrame(frame)
}

function wander () {
  if (state.paused || state.asleep || state.dragging) return schedule(wander, ...MOTION.wander)
  walkTo(rand(EDGE, bounds.w - WIDTH - EDGE))
  schedule(wander, ...MOTION.wander)
}

/* ---------- speech ---------- */

let bubbleTimer = null

function say (text, ms = 4200) {
  if (state.paused) return
  el.bubble.textContent = text
  el.bubble.classList.toggle('flip', state.x > bounds.w - 260)
  el.bubble.classList.add('show')
  el.pet.classList.add('talking')
  clearTimeout(bubbleTimer)
  bubbleTimer = setTimeout(() => {
    el.bubble.classList.remove('show')
    el.pet.classList.remove('talking')
  }, ms)
}

function ambient () {
  if (!state.paused && !state.asleep) say(pick(AMBIENT))
  schedule(ambient, ...MOTION.ambient)
}

/* ---------- reactions ---------- */

function celebrate () {
  wake()
  markCare('petted')
  setMode('happy')
  say(pick(ON_CLICK), 2600)
  for (let i = 0; i < 4; i++) {
    const heart = document.createElement('span')
    heart.className = 'heart'
    heart.textContent = pick(['💛', '💙', '💗', '✨'])
    heart.style.left = `${rand(14, WIDTH - 30)}px`
    heart.style.setProperty('--dx', `${rand(-16, 16)}px`)
    heart.style.animationDelay = `${i * 70}ms`
    el.hearts.appendChild(heart)
    setTimeout(() => heart.remove(), 1400)
  }
  setTimeout(() => { if (state.mode === 'happy') setMode('idle') }, 900)
}

/* ---------- daily care loop ---------- */

function markCare (task) {
  state.care[task] = true
  if (!state.care.done && state.care.petted && state.care.studied && state.care.walked) {
    state.care.done = true
    state.lastCaredAt = Date.now()
    el.pet.classList.add('cared')
    say(LINES.cared, 5000)
  }
}

/* Study rewards arrive one at a time from main.js as sessions are logged.
   They queue so two logged in the same poll play back to back instead of
   stomping each other. */
const rewardQueue = []
let playingReward = false

function queueReward (tier) {
  rewardQueue.push(tier)
  if (!playingReward) playNextReward()
}

async function playNextReward () {
  const tier = rewardQueue.shift()
  if (!tier) { playingReward = false; return }
  playingReward = true
  wake()
  markCare('studied')

  if (tier === 'water') {
    el.water.innerHTML = water
    el.water.classList.remove('gone')
    el.water.classList.add('drop')
    el.pet.classList.add('drinking')
    say(pick(LINES.drink), 2400)
    await wait(2200)
    el.water.classList.add('gone')
    el.pet.classList.remove('drinking')
  } else if (tier === 'fed') {
    el.leaf.innerHTML = leaf
    el.leaf.classList.remove('gone')
    el.leaf.classList.add('drop')
    await wait(500)
    el.pet.classList.add('eating')
    el.leaf.classList.add('gone')
    say(pick(LINES.eat), 2400)
    await wait(2000)
    el.pet.classList.remove('eating')
  } else if (tier === 'clean') {
    el.pet.classList.add('cleaning')
    el.bubbles.innerHTML = ''
    for (let i = 0; i < 8; i++) {
      const b = document.createElement('div')
      b.className = 'bubble'
      b.innerHTML = bubbleSvg
      b.style.left = `${10 + i * 11}%`
      b.style.setProperty('--dx', `${i % 2 ? 18 : -18}px`)
      b.style.animationDelay = `${i * 90}ms`
      el.bubbles.appendChild(b)
    }
    say(pick(LINES.clean), 2600)
    await wait(1800)
    el.pet.classList.remove('cleaning')
    el.pet.classList.add('shiny')
  }

  await wait(400)
  playNextReward()
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------- mood ---------- */

const RECENTLY_CARED_MS = 30 * 60000

function updateMood () {
  el.pet.classList.remove('mood-bright', 'mood-sleepy')
  if (!state.asleep) {
    if (Date.now() - state.lastCaredAt < RECENTLY_CARED_MS) {
      el.pet.classList.add('mood-bright')
    } else if (Date.now() - state.lastActivity > IDLE_BEFORE_SLEEP / 2) {
      el.pet.classList.add('mood-sleepy')
    }
  }
  schedule(updateMood, 60000, 60000)
}

/* ---------- affirmations ---------- */

/* Fires the first slot that is due and has not run today. Deliberately "past
   this time" rather than "at this exact minute": the Mac sleeps, timers drift
   in a hidden window, and he may be snoozed at 09:00 sharp. A late line is
   better than a lost one. A slot missed by more than two hours is dropped
   instead, since "morning. no rush." at 4pm is just wrong. */
const AFFIRMATION_GRACE_MS = 2 * 60 * 60000

function minutesOfDay (hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function checkAffirmations () {
  if (AFFIRMATIONS.enabled && !state.paused && !state.asleep) {
    const now = new Date()
    const nowMins = now.getHours() * 60 + now.getMinutes()
    for (const [slot, lines] of Object.entries(AFFIRMATIONS.slots)) {
      if (state.affirmedToday.has(slot)) continue
      const due = minutesOfDay(slot)
      if (nowMins < due) continue
      state.affirmedToday.add(slot)
      if ((nowMins - due) * 60000 <= AFFIRMATION_GRACE_MS) {
        say(pick(lines), 5500)
        break // one line at a time, never a backlog dump
      }
    }
  }
  schedule(checkAffirmations, 30000, 30000)
}

/* ---------- midnight reset ---------- */

function checkMidnight () {
  const today = localDay()
  if (today !== state.day) {
    state.day = today
    state.care = { petted: false, studied: false, walked: false, done: false }
    state.affirmedToday = new Set()
    el.pet.classList.remove('cared', 'shiny')
  }
  schedule(checkMidnight, 60000, 60000)
}

function blink () {
  if (!state.asleep) {
    el.pet.classList.add('blink')
    setTimeout(() => el.pet.classList.remove('blink'), 130)
  }
  schedule(blink, ...MOTION.blink)
}

/* ---------- sleep ---------- */

const IDLE_BEFORE_SLEEP = MOTION.idleBeforeSleep

function checkIdle () {
  if (!state.asleep && !state.paused && Date.now() - state.lastActivity > IDLE_BEFORE_SLEEP) {
    state.asleep = true
    state.target = null
    setMode('sleep')
    say(LINES.sleep, 3000)
  }
  schedule(checkIdle, 30000, 30000)
}

function wake () {
  state.lastActivity = Date.now()
  if (state.asleep) {
    state.asleep = false
    setMode('idle')
    say(pick(ON_WAKE), 2600)
  }
}

/* ---------- hover and clicks ---------- */

function updateHover () {
  // While dragging, keep the window interactive regardless of where the
  // cursor drifts. It only entered drag with the cursor over the sprite in
  // the first place, and a drag can carry the cursor above the pet's strip.
  if (state.dragging) return
  const { x, y } = state.cursor
  if (x < 0) return
  const top = bounds.h - HEIGHT
  const over = x >= state.x && x <= state.x + WIDTH && y >= top && y <= bounds.h
  if (over !== state.interactive) {
    state.interactive = over
    window.pet.setInteractive(over)
    document.body.style.cursor = over ? 'pointer' : 'default'
  }
}

window.addEventListener('mousemove', (e) => {
  state.cursor = { x: e.clientX, y: e.clientY }
  state.lastActivity = Date.now()
  if (state.asleep) wake()
  if (state.dragging) {
    if (!state.dragMoved && Math.abs(e.clientX - state.dragStartX) > DRAG_THRESHOLD) {
      state.dragMoved = true
      state.target = null
      setMode('walk')
    }
    if (state.dragMoved) {
      const next = clamp(state.x + (e.clientX - state.dragLastX))
      el.pet.dataset.facing = next < state.x ? 'left' : 'right'
      state.x = next
      draw()
    }
    state.dragLastX = e.clientX
  }
})

/* ---------- drag to move ---------- */

const DRAG_THRESHOLD = 6 // px, below this a mousedown+up is a click, not a drag

el.pet.addEventListener('mousedown', (e) => {
  wake()
  state.dragging = true
  state.dragMoved = false
  state.dragStartX = e.clientX
  state.dragLastX = e.clientX
  document.body.style.cursor = 'grabbing'
})

let lastClickAt = 0
const DOUBLE_CLICK_MS = 320

window.addEventListener('mouseup', () => {
  if (!state.dragging) return
  const moved = state.dragMoved
  state.dragging = false
  document.body.style.cursor = 'pointer'
  if (moved) {
    setMode('idle')
    return
  }
  // A double-click hides him for a screenshot. Bring him back with
  // Ctrl+Alt+P or the tray menu, same as waking from a snooze.
  const now = Date.now()
  if (now - lastClickAt < DOUBLE_CLICK_MS) {
    lastClickAt = 0
    window.pet.hide()
    return
  }
  lastClickAt = now
  celebrate() // a single click
})

/* ---------- scheduling helper ---------- */

const timers = new Set()
function schedule (fn, min, max) {
  const id = setTimeout(() => { timers.delete(id); fn() }, rand(min, max))
  timers.add(id)
}

/* ---------- tray and hotkey wiring ---------- */

window.pet.onSummon(async () => {
  wake()
  markCare('walked')
  const c = await window.pet.cursor()
  walkTo(c.x - WIDTH / 2, () => say(pick(ON_SUMMON), 2600))
})

window.pet.onSpeak(() => { wake(); say(pick(AMBIENT)) })
window.pet.onSnooze(() => { state.paused = true; el.bubble.classList.remove('show') })
window.pet.onWake(() => { state.paused = false; wake() })
window.pet.onResized(measure)
window.pet.onReward(({ tier }) => queueReward(tier))
window.addEventListener('resize', measure)
window.addEventListener('load', measure) // re-measure once layout is definitely committed

/* ---------- boot ---------- */

state.x = clamp(bounds.w * 0.72)
el.pet.dataset.facing = 'left'
draw()
requestAnimationFrame(frame)

schedule(wander, 15000, 25000)
schedule(ambient, 90000, 150000)
schedule(blink, ...MOTION.blink)
schedule(checkIdle, 30000, 30000)
schedule(updateMood, 60000, 60000)
schedule(checkAffirmations, 30000, 30000)
schedule(checkMidnight, 60000, 60000)
setTimeout(() => say(LINES.hello, 5000), 1200)
