// scripts/screenshots.mjs
// captures full-page screenshots at various viewports & sections (workspace,
// templates marketplace). each section dumps into screenshots/<sectionName>/
// Usage: npm run screenshots [-- <section> ...] (requires dev server up)
// Examples:
//   npm run screenshots                        # all sections
//   npm run screenshots -- templates           # just /templates
//   npm run screenshots -- workspace templates # both, explicitly

import { chromium } from 'playwright'
import { existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { formatBytes } from './lib/formatBytes.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = 'http://localhost:5173'
const OUT_ROOT = join(__dirname, '..', 'screenshots')
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

// toolbar positions to capture (set via Zustand localStorage injection).
// only meaningful on workspace pages so per-section opt-in via toolbarVariants
const TOOLBAR_POSITIONS = ['top', 'bottom', 'left', 'right']

// section registry — each entry is one capture target. add new pages here.
// toolbarVariants=true iterates TOOLBAR_POSITIONS × viewports (workspace only);
// false captures one shot per viewport. subdir name doubles as the CLI filter
const SECTIONS = {
  workspace: {
    path: '/',
    toolbarVariants: true,
  },
  templates: {
    path: '/templates',
    toolbarVariants: false,
  },
}

// Zustand preferences store key (matches PREFERENCES_STORAGE_KEY)
const PREFERENCES_KEY = 'tier-list-builder-preferences'

// parse PREFERENCES_STORAGE_VERSION out of the source of truth so this script
// stays in sync w/ the store version w/o needing a TS loader
function readPreferencesStorageVersion()
{
  const source = readFileSync(
    join(
      __dirname,
      '..',
      'src/features/platform/preferences/data/local/preferencesStorage.ts'
    ),
    'utf8'
  )
  const match = source.match(/PREFERENCES_STORAGE_VERSION\s*=\s*(\d+)/)
  if (!match) throw new Error('could not parse PREFERENCES_STORAGE_VERSION')
  return Number.parseInt(match[1], 10)
}

const PREFERENCES_STORAGE_VERSION = readPreferencesStorageVersion()

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

// inject a toolbar position into the Zustand preferences store via localStorage
function buildPreferencesPayload(position)
{
  return JSON.stringify({
    state: {
      itemSize: 'medium',
      showLabels: false,
      itemShape: 'square',
      compactMode: false,
      exportBackgroundOverride: null,
      boardBackgroundOverride: null,
      labelWidth: 'default',
      hideRowControls: false,
      confirmBeforeDelete: false,
      themeId: 'scoreboard',
      paletteId: 'classic',
      textStyleId: 'default',
      tierLabelBold: false,
      tierLabelItalic: false,
      tierLabelFontSize: 'small',
      boardLocked: false,
      reducedMotion: false,
      toolbarPosition: position,
      showAltTextButton: false,
      autoCropTrimSoftShadows: true,
    },
    version: PREFERENCES_STORAGE_VERSION,
  })
}

// resolve the section filter from CLI args. empty filter = run all sections.
// unknown names print an error & list valid options so typos exit fast
function resolveSectionFilter(argv)
{
  const requested = argv.slice(2).filter((arg) => !arg.startsWith('-'))
  if (requested.length === 0) return Object.keys(SECTIONS)
  const unknown = requested.filter((name) => !(name in SECTIONS))
  if (unknown.length > 0)
  {
    const valid = Object.keys(SECTIONS).join(', ')
    console.error(
      `\nUnknown section(s): ${unknown.join(', ')}\nValid: ${valid}\n`
    )
    process.exit(1)
  }
  return requested
}

async function applyPagePreferences(page, position)
{
  await page.addInitScript(
    ({ key, payload }) =>
    {
      if (payload === null)
      {
        localStorage.removeItem(key)
        return
      }
      localStorage.setItem(key, payload)
    },
    {
      key: PREFERENCES_KEY,
      payload: position === null ? null : buildPreferencesPayload(position),
    }
  )
}

async function captureShot(
  context,
  sectionName,
  section,
  vp,
  position,
  results
)
{
  const page = await context.newPage()
  await applyPagePreferences(page, position)

  const filename =
    position !== null ? `${vp.name}__toolbar-${position}.png` : `${vp.name}.png`
  const filepath = join(OUT_ROOT, sectionName, filename)

  try
  {
    await page.goto(`${BASE_URL}${section.path}`, {
      waitUntil: 'networkidle',
    })
    await page.waitForTimeout(ANIMATION_WAIT)
    await page.screenshot({ path: filepath, fullPage: true })
  }
  finally
  {
    await page.close()
  }

  const size = statSync(filepath).size
  results.push({
    section: sectionName,
    viewport: vp.name,
    dims: `${vp.width}x${vp.height}`,
    dpr: `${vp.dpr}x`,
    position: position ?? '-',
    file: join(sectionName, filename),
    size: formatBytes(size),
  })

  console.log(`  ${sectionName}/${filename} (${formatBytes(size)})`)
}

// capture selected sections for one viewport while reusing the same browser
// context. toolbar preferences are injected per page before app scripts run.
async function captureViewport(browser, vp, sectionsToRun, results)
{
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
  })

  try
  {
    for (const sectionName of sectionsToRun)
    {
      const section = SECTIONS[sectionName]
      const positions = section.toolbarVariants ? TOOLBAR_POSITIONS : [null]
      for (const position of positions)
      {
        await captureShot(context, sectionName, section, vp, position, results)
      }
    }
  }
  finally
  {
    await context.close()
  }
}

async function captureSections(browser, sectionsToRun, results)
{
  for (const vp of VIEWPORTS)
  {
    console.log(`\n--- ${vp.name} (${vp.width}x${vp.height} @ ${vp.dpr}x) ---`)
    await captureViewport(browser, vp, sectionsToRun, results)
  }
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

  const sectionsToRun = resolveSectionFilter(process.argv)
  if (!existsSync(OUT_ROOT)) mkdirSync(OUT_ROOT, { recursive: true })
  for (const sectionName of sectionsToRun)
  {
    const sectionDir = join(OUT_ROOT, sectionName)
    if (!existsSync(sectionDir)) mkdirSync(sectionDir, { recursive: true })
  }

  const totalCaptures = sectionsToRun.reduce((total, sectionName) =>
  {
    const positions = SECTIONS[sectionName].toolbarVariants
      ? TOOLBAR_POSITIONS
      : [null]
    return total + VIEWPORTS.length * positions.length
  }, 0)
  console.log(
    `\nCapturing sections [${sectionsToRun.join(', ')}] across ${VIEWPORTS.length} viewports (${totalCaptures} total)...\n`
  )

  const browser = await chromium.launch()
  const results = []

  try
  {
    await captureSections(browser, sectionsToRun, results)
  }
  finally
  {
    await browser.close()
  }

  // summary table
  console.log('\n' + '='.repeat(120))
  console.log(
    'Section'.padEnd(12) +
      'Viewport'.padEnd(22) +
      'CSS Pixels'.padEnd(14) +
      'DPR'.padEnd(6) +
      'Position'.padEnd(10) +
      'File Size'.padEnd(12) +
      'File'
  )
  console.log('-'.repeat(120))
  for (const r of results)
  {
    console.log(
      r.section.padEnd(12) +
        r.viewport.padEnd(22) +
        r.dims.padEnd(14) +
        r.dpr.padEnd(6) +
        r.position.padEnd(10) +
        r.size.padEnd(12) +
        r.file
    )
  }
  console.log('='.repeat(120))
  console.log(`\n${results.length} screenshots saved to ${OUT_ROOT}\n`)
}

main()
