const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, globalShortcut } = require('electron')
const path = require('path')

let win = null
let tray = null
let snoozeTimer = null

/* Study tracker hook. Read-only, GET only, never writes back to the tracker.
   Settings live in renderer/config.js (STUDY) so there is one source of
   truth; loaded here via dynamic import since this file is CommonJS. */
let STUDY = { enabled: false }
let seenSessionIds = new Set()
let seenDay = null

function localDay (d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function tierFor (minutes) {
  const t = STUDY.tiers
  if (minutes >= t.clean) return 'clean'
  if (minutes >= t.fed) return 'fed'
  if (minutes >= t.water) return 'water'
  return null
}

async function pollStudyTracker () {
  if (!STUDY.enabled) return
  const today = localDay()
  if (today !== seenDay) {
    seenDay = today
    seenSessionIds = new Set() // a new local day, sessions can be re-rewarded
  }

  try {
    const res = await fetch(STUDY.apiUrl, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return
    const body = await res.json()
    const sessions = body?.data?.sessions
    if (!Array.isArray(sessions)) return

    for (const s of sessions) {
      if (s.date !== today || seenSessionIds.has(s.id)) continue
      seenSessionIds.add(s.id)
      const minutes = (s.durationMs || 0) / 60000
      const tier = tierFor(minutes)
      if (tier) send('pet:reward', { tier, minutes: Math.round(minutes) })
    }
  } catch (e) {
    // Tracker not running, or unreachable. Ambient app, no error surface.
  }
}

const OVERLAY_OPTS = {
  transparent: true,
  frame: false,
  hasShadow: false,
  resizable: false,
  movable: false,
  focusable: false,
  skipTaskbar: true,
  fullscreenable: false,
  // 'panel' lets the window float above other apps, including fullscreen ones
  type: 'panel',
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    backgroundThrottling: false
  }
}

function workArea () {
  return screen.getPrimaryDisplay().workArea
}

function createWindow () {
  const area = workArea()

  win = new BrowserWindow({ ...OVERLAY_OPTS, ...area, show: false })

  // Click through everywhere except the pet itself. The renderer flips this
  // off while the cursor is over the sprite so clicks and hovers land.
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  win.loadFile(path.join(__dirname, 'renderer/index.html'))
  win.once('ready-to-show', () => win.showInactive())

  screen.on('display-metrics-changed', resize)
  screen.on('display-added', resize)
  screen.on('display-removed', resize)
}

function resize () {
  if (!win || win.isDestroyed()) return
  win.setBounds(workArea())
  win.webContents.send('pet:resized')
}

function send (channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

/* Anything that should reach the pet has to un-hide him first: he may be
   snoozed, or vanished by a double-click for a screenshot. */
function reveal () {
  if (!win || win.isDestroyed()) return
  clearTimeout(snoozeTimer)
  if (!win.isVisible()) {
    win.showInactive()
    send('pet:wake')
  }
}

function summon () {
  reveal()
  send('pet:summon')
}

function setSnooze (minutes) {
  clearTimeout(snoozeTimer)
  if (!minutes) return reveal()
  send('pet:snooze')
  win.hide()
  snoozeTimer = setTimeout(() => {
    win.showInactive()
    send('pet:wake')
  }, minutes * 60 * 1000)
}

function buildTray () {
  const iconPath = path.join(__dirname, '..', 'assets', 'iconTemplate.png')
  const icon = nativeImage.createFromPath(iconPath)
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('Tort')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Come here', accelerator: 'Ctrl+Alt+P', click: summon },
    { label: 'Say something', click: () => { reveal(); send('pet:speak') } },
    { type: 'separator' },
    { label: 'Snooze 30 min', click: () => setSnooze(30) },
    { label: 'Snooze 1 hour', click: () => setSnooze(60) },
    { label: 'Show Tort', click: () => setSnooze(0) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]))
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock.hide()
  createWindow()
  buildTray()
  globalShortcut.register('Control+Alt+P', summon)

  try {
    const { STUDY: cfg } = await import(path.join(__dirname, 'renderer/config.js'))
    STUDY = cfg
    if (STUDY.enabled) {
      pollStudyTracker()
      setInterval(pollStudyTracker, STUDY.pollMs)
    }
  } catch (e) {
    // config.js failed to load; run without the study hook rather than crash.
  }
})

// The renderer owns the whole lifetime. Closing all windows should not quit,
// but there is only one window, so treat its loss as a quit.
app.on('window-all-closed', () => app.quit())
app.on('will-quit', () => globalShortcut.unregisterAll())

// Double-click to vanish for a screenshot. Bring him back with Ctrl+Alt+P,
// or any tray item (they all call reveal first). Same as a snooze, with no
// timer to end it.
ipcMain.on('pet:hide', () => {
  if (!win || win.isDestroyed()) return
  clearTimeout(snoozeTimer)
  send('pet:snooze')
  win.hide()
})

// Renderer tells us whether the cursor is over the sprite.
ipcMain.on('pet:interactive', (_e, interactive) => {
  if (!win || win.isDestroyed()) return
  win.setIgnoreMouseEvents(!interactive, { forward: true })
})

// Cursor position, so the pet can walk to where you are.
ipcMain.handle('pet:cursor', () => {
  const { x, y } = screen.getCursorScreenPoint()
  const area = workArea()
  return { x: x - area.x, y: y - area.y }
})
