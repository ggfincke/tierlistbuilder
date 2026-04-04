// scripts/screenshots.mjs
// captures full-page screenshots at various viewports & toolbar positions
// Usage: npm run screenshots (requires dev server running on localhost:5173)

import { chromium } from 'playwright'
import { existsSync, mkdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = 'http://localhost:5173'
const OUT_DIR = join(__dirname, '..', 'screenshots')
// longest CSS animation is 600ms + buffer
const ANIMATION_WAIT = 800

// width/height = CSS pixels, dpr = deviceScaleFactor
const VIEWPORTS = [
  // mobile
  { name: 'iPhone-SE', width: 375, height: 667, dpr: 2 },
  { name: 'iPhone-14-Pro', width: 393, height: 852, dpr: 3 },
  { name: 'iPhone-15-Pro-Max', width: 430, height: 932, dpr: 3 },
  // tablet
  { name: 'iPad-Mini', width: 768, height: 1024, dpr: 2 },
  { name: 'iPad-Air', width: 820, height: 1180, dpr: 2 },
  { name: 'iPad-Pro-12.9', width: 1024, height: 1366, dpr: 2 },
  // MacBook (Retina 2x)
  { name: 'MacBook-Air-13', width: 1440, height: 900, dpr: 2 },
  { name: 'MacBook-Air-13-M2', width: 1470, height: 956, dpr: 2 },
  { name: 'MacBook-Pro-14', width: 1512, height: 982, dpr: 2 },
  { name: 'MacBook-Air-15', width: 1680, height: 1050, dpr: 2 },
  { name: 'MacBook-Pro-16', width: 1728, height: 1117, dpr: 2 },
  // desktop
  { name: '1080p', width: 1920, height: 1080, dpr: 1 },
  { name: '1440p-QHD', width: 2560, height: 1440, dpr: 1 },
  // 4K monitors (physical 3840x2160, typical OS scaling)
  { name: '4K-150pct', width: 2560, height: 1440, dpr: 1.5 },
  { name: '4K-200pct', width: 1920, height: 1080, dpr: 2 },
]

// toolbar positions to capture (set via Zustand localStorage injection)
const TOOLBAR_POSITIONS = ['top', 'bottom', 'left', 'right']

// Zustand settings store key (matches SETTINGS_STORAGE_KEY in storage.ts)
const SETTINGS_KEY = 'tier-list-builder-settings'

function formatSize(bytes)
{
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(2)} MB`
}

async function checkServer()
{
  try
  {
    const res = await fetch(BASE_URL)
    return res.ok
  }
  catch
  {
    return false
  }
}

// inject a toolbar position into the Zustand settings store via localStorage
function buildSettingsPayload(position)
{
  return JSON.stringify({
    state: {
      itemSize: 'medium',
      showLabels: false,
      itemShape: 'square',
      compactMode: false,
      exportBackgroundOverride: null,
      labelWidth: 'default',
      hideRowControls: false,
      confirmBeforeDelete: false,
      themeId: 'classic',
      paletteId: 'classic',
      textStyleId: 'default',
      tierLabelBold: false,
      tierLabelItalic: false,
      tierLabelFontSize: 'small',
      boardLocked: false,
      reducedMotion: false,
      preHighContrastThemeId: null,
      preHighContrastPaletteId: null,
      toolbarPosition: position,
      showAltTextButton: false,
    },
    version: 11,
  })
}

async function main()
{
  const serverUp = await checkServer()
  if (!serverUp)
  {
    console.error(
      `\nDev server not reachable at ${BASE_URL}\nRun "npm run dev" first, then try again.\n`
    )
    process.exit(1)
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

  const totalCaptures = VIEWPORTS.length * TOOLBAR_POSITIONS.length
  console.log(
    `\nCapturing ${VIEWPORTS.length} viewports x ${TOOLBAR_POSITIONS.length} toolbar positions (${totalCaptures} total)...\n`
  )

  const browser = await chromium.launch()
  const results = []

  for (const vp of VIEWPORTS)
  {
    for (const position of TOOLBAR_POSITIONS)
    {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dpr,
      })

      // inject toolbar position into localStorage before navigation
      await context.addInitScript(
        ({ key, payload }) =>
        {
          localStorage.setItem(key, payload)
        },
        { key: SETTINGS_KEY, payload: buildSettingsPayload(position) }
      )

      const page = await context.newPage()
      const filename = `${vp.name}__toolbar-${position}.png`
      const filepath = join(OUT_DIR, filename)

      await page.goto(BASE_URL, { waitUntil: 'networkidle' })
      await page.waitForTimeout(ANIMATION_WAIT)
      await page.screenshot({ path: filepath, fullPage: true })

      const size = statSync(filepath).size
      results.push({
        viewport: vp.name,
        dims: `${vp.width}x${vp.height}`,
        dpr: `${vp.dpr}x`,
        position,
        file: filename,
        size: formatSize(size),
      })

      console.log(`  ${filename} (${formatSize(size)})`)
      await context.close()
    }
  }

  // summary table
  console.log('\n' + '='.repeat(110))
  console.log(
    'Viewport'.padEnd(24) +
      'CSS Pixels'.padEnd(14) +
      'DPR'.padEnd(6) +
      'Position'.padEnd(10) +
      'File Size'.padEnd(12) +
      'File'
  )
  console.log('-'.repeat(110))
  for (const r of results)
  {
    console.log(
      r.viewport.padEnd(24) +
        r.dims.padEnd(14) +
        r.dpr.padEnd(6) +
        r.position.padEnd(10) +
        r.size.padEnd(12) +
        r.file
    )
  }
  console.log('='.repeat(110))
  console.log(`\n${results.length} screenshots saved to ${OUT_DIR}\n`)

  await browser.close()
}

main()
