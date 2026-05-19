#!/usr/bin/env tsx
// scripts/preview-cover.ts
// render seed cover images at the three marketplace surface aspects

import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve,
} from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

import {
  COVER_SURFACES,
  SURFACE_ASPECT_RATIOS,
  type CoverFrame,
  type CoverSurface,
  type TemplateCoverFraming,
} from '@tierlistbuilder/contracts/marketplace/template'

import { computeFramedPlacement } from '../src/shared/board-ui/coverFramingPlacement'

interface ParsedArgs
{
  input: string
  zoom: number | null
  outPath: string | null
}

interface SeedTemplate
{
  externalId: string
  folder: string
  coverZoom?: number
}

interface TemplateRecord
{
  template: SeedTemplate
  coverPath: string
}

interface ResolvedCover
{
  coverPath: string
  defaultZoom: number
  name: string
  source: 'template' | 'path'
}

interface SurfacePreview
{
  surface: CoverSurface
  buffer: Buffer
  width: number
  height: number
}

const MATTE_HEX = '#0a0a0c'
const CANVAS_HEX = '#ffffff'
const LABEL_TEXT_HEX = '#1f2937'
const SUBTLE_TEXT_HEX = '#6b7280'
const PREVIEW_BASE_WIDTH = 720
const ROW_GAP = 28
const LABEL_HEIGHT = 48
const HEADER_HEIGHT = 64
const SIDE_PAD = 32
const TOP_PAD = 28
const BOTTOM_PAD = 32
const FONT_STACK = '-apple-system, BlinkMacSystemFont, Roboto, sans-serif'

// covers are auto-detected as _cover.<ext> in each template's folder; the build
// pipeline accepts the same extension list, so we mirror it here for parity
const COVER_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const
const IMAGE_EXTENSIONS = new Set<string>([...COVER_EXTENSIONS, '.gif'])

const moduleDir = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(moduleDir, '..')
const DEFAULT_OUT_DIR = join(REPO_ROOT, 'cover-previews')
const TEMPLATES_DIR = join(REPO_ROOT, 'data/seeds/templates')

const usage = (): never =>
{
  process.stderr.write(
    [
      'usage: tsx scripts/preview-cover.ts <templateOrImage> [--zoom <n>] [--out <path>]',
      '',
      '  <templateOrImage>  template externalId, folder slug, or image path.',
      '                     examples: gaming:ssbu-fighters, ssbu-fighters,',
      '                     examples/gaming/ssbu-fighters/_cover.jpg',
      "  --zoom <n>         override coverZoom; defaults to the template's",
      '                     coverZoom for matched templates, 1.0 for raw paths',
      '  --out <path>       output PNG path; default: cover-previews/<name>-z<n>.png',
      '',
    ].join('\n')
  )
  process.exit(1)
}

const parseArgs = (raw: readonly string[]): ParsedArgs =>
{
  let input: string | null = null
  let zoom: number | null = null
  let outPath: string | null = null
  for (let i = 0; i < raw.length; i++)
  {
    const arg = raw[i]
    if (arg === '-h' || arg === '--help') usage()
    if (arg === '--zoom')
    {
      const next = raw[++i]
      if (next === undefined) usage()
      const parsed = Number(next)
      if (!Number.isFinite(parsed) || parsed <= 0)
      {
        process.stderr.write(`--zoom must be a positive number; got ${next}\n`)
        process.exit(1)
      }
      zoom = parsed
      continue
    }
    if (arg === '--out')
    {
      const next = raw[++i]
      if (next === undefined) usage()
      outPath = next
      continue
    }
    if (arg.startsWith('-'))
    {
      process.stderr.write(`unknown flag: ${arg}\n`)
      usage()
    }
    if (input !== null)
    {
      process.stderr.write('only one templateOrImage argument is allowed\n')
      usage()
    }
    input = arg
  }
  if (input === null) usage()
  return { input, zoom, outPath }
}

const looksLikePath = (input: string): boolean =>
  input.includes('/') || IMAGE_EXTENSIONS.has(extname(input).toLowerCase())

const detectCover = (folderAbs: string): string | null =>
{
  for (const ext of COVER_EXTENSIONS)
  {
    const candidate = join(folderAbs, `_cover${ext}`)
    if (existsSync(candidate)) return candidate
  }
  return null
}

const loadTemplateRecords = async (): Promise<TemplateRecord[]> =>
{
  if (!existsSync(TEMPLATES_DIR)) return []
  const records: TemplateRecord[] = []
  const categories = await readdir(TEMPLATES_DIR, { withFileTypes: true })
  for (const category of categories)
  {
    if (!category.isDirectory()) continue
    const categoryDir = join(TEMPLATES_DIR, category.name)
    const files = await readdir(categoryDir, { withFileTypes: true })
    for (const file of files)
    {
      if (!file.isFile() || !file.name.endsWith('.json')) continue
      const text = await readFile(join(categoryDir, file.name), 'utf8')
      const template = JSON.parse(text) as SeedTemplate
      if (typeof template.folder !== 'string') continue
      const coverPath = detectCover(resolve(REPO_ROOT, template.folder))
      if (!coverPath) continue
      records.push({ template, coverPath })
    }
  }
  return records
}

const templateAliases = (record: TemplateRecord): string[] =>
{
  const out = [record.template.externalId]
  const externalSlug = record.template.externalId.split(':').at(-1)
  if (externalSlug) out.push(externalSlug)
  out.push(basename(record.template.folder))
  return out
}

const resolveFromTemplates = async (
  input: string
): Promise<ResolvedCover | null> =>
{
  const records = await loadTemplateRecords()
  const record = records.find((candidate) =>
    templateAliases(candidate).includes(input)
  )
  if (!record) return null
  const zoom =
    typeof record.template.coverZoom === 'number' &&
    Number.isFinite(record.template.coverZoom)
      ? record.template.coverZoom
      : 1
  return {
    coverPath: record.coverPath,
    defaultZoom: zoom,
    name: basename(record.template.folder),
    source: 'template',
  }
}

const resolvePath = (input: string): ResolvedCover =>
{
  const coverPath = isAbsolute(input) ? input : resolve(process.cwd(), input)
  if (!existsSync(coverPath))
  {
    process.stderr.write(`image path does not exist: ${coverPath}\n`)
    process.exit(1)
  }
  // when pointed at a `_cover.<ext>` file the stem is uninformative, so use the
  // parent folder name (which is the template slug for in-tree examples)
  const stem = basename(coverPath, extname(coverPath))
  const name = stem === '_cover' ? basename(dirname(coverPath)) : stem
  return {
    coverPath,
    defaultZoom: 1,
    name,
    source: 'path',
  }
}

const resolveCover = async (input: string): Promise<ResolvedCover> =>
{
  if (looksLikePath(input)) return resolvePath(input)
  const templateCover = await resolveFromTemplates(input)
  if (templateCover) return templateCover
  process.stderr.write(
    `no template matches: ${input}\n` +
      `  (looked in ${TEMPLATES_DIR}; use a path like ` +
      `examples/<cat>/<slug>/_cover.jpg for raw images)\n`
  )
  process.exit(1)
}

const surfacePreviewSize = (
  surface: CoverSurface
): { width: number; height: number } => ({
  width: PREVIEW_BASE_WIDTH,
  height: Math.round(PREVIEW_BASE_WIDTH / SURFACE_ASPECT_RATIOS[surface]),
})

const matteCanvas = (width: number, height: number): sharp.Sharp =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: MATTE_HEX,
    },
  })

const renderSurface = async (
  coverPath: string,
  sourceWidth: number,
  sourceHeight: number,
  surface: CoverSurface,
  framing: TemplateCoverFraming | null
): Promise<SurfacePreview> =>
{
  const { width, height } = surfacePreviewSize(surface)
  const frame: CoverFrame | null = framing?.[surface] ?? null
  const placement = computeFramedPlacement({
    frame,
    containerWidth: width,
    containerHeight: height,
    sourceWidth,
    sourceHeight,
  })
  if (!placement)
  {
    return {
      surface,
      buffer: await matteCanvas(width, height).png().toBuffer(),
      width,
      height,
    }
  }
  const drawW = Math.max(1, Math.round(placement.width))
  const drawH = Math.max(1, Math.round(placement.height))
  const placeLeft = Math.round(placement.left)
  const placeTop = Math.round(placement.top)
  const visibleSrcLeft = Math.max(0, -placeLeft)
  const visibleSrcTop = Math.max(0, -placeTop)
  const visibleSrcRight = Math.min(drawW, width - placeLeft)
  const visibleSrcBottom = Math.min(drawH, height - placeTop)
  const visibleW = visibleSrcRight - visibleSrcLeft
  const visibleH = visibleSrcBottom - visibleSrcTop
  if (visibleW <= 0 || visibleH <= 0)
  {
    return {
      surface,
      buffer: await matteCanvas(width, height).png().toBuffer(),
      width,
      height,
    }
  }
  const drawn = await sharp(coverPath)
    .rotate()
    .resize({ width: drawW, height: drawH, fit: 'fill' })
    .toBuffer()
  const cropped = await sharp(drawn)
    .extract({
      left: visibleSrcLeft,
      top: visibleSrcTop,
      width: visibleW,
      height: visibleH,
    })
    .toBuffer()
  const buffer = await matteCanvas(width, height)
    .composite([
      {
        input: cropped,
        left: Math.max(0, placeLeft),
        top: Math.max(0, placeTop),
      },
    ])
    .png()
    .toBuffer()
  return { surface, buffer, width, height }
}

const zoomedFrameForSurface = (
  sourceWidth: number,
  sourceHeight: number,
  surfaceAspect: number,
  zoom: number
): CoverFrame =>
{
  const sourceAspect = sourceWidth / sourceHeight
  const baseWidth =
    surfaceAspect >= sourceAspect ? 1 : surfaceAspect / sourceAspect
  const baseHeight =
    surfaceAspect >= sourceAspect ? sourceAspect / surfaceAspect : 1
  const width = baseWidth * zoom
  const height = baseHeight * zoom
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height }
}

const computeZoomedCoverFraming = (
  sourceWidth: number,
  sourceHeight: number,
  zoom: number
): TemplateCoverFraming =>
{
  const out = {} as Record<CoverSurface, CoverFrame>
  for (const surface of COVER_SURFACES)
  {
    out[surface] = zoomedFrameForSurface(
      sourceWidth,
      sourceHeight,
      SURFACE_ASPECT_RATIOS[surface],
      zoom
    )
  }
  return out
}

const escapeXml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const buildHeaderSvg = (
  title: string,
  subtitle: string,
  width: number
): Buffer =>
  Buffer.from(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEADER_HEIGHT}">`,
      `<rect width="100%" height="100%" fill="${CANVAS_HEX}"/>`,
      `<text x="0" y="26" font-family="${FONT_STACK}" font-size="22" font-weight="700" fill="${LABEL_TEXT_HEX}">${escapeXml(title)}</text>`,
      `<text x="0" y="54" font-family="${FONT_STACK}" font-size="14" fill="${SUBTLE_TEXT_HEX}">${escapeXml(subtitle)}</text>`,
      '</svg>',
    ].join(''),
    'utf-8'
  )

const buildLabelSvg = (
  title: string,
  subtitle: string,
  width: number
): Buffer =>
  Buffer.from(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LABEL_HEIGHT}">`,
      `<rect width="100%" height="100%" fill="${CANVAS_HEX}"/>`,
      `<text x="0" y="22" font-family="${FONT_STACK}" font-size="16" font-weight="600" fill="${LABEL_TEXT_HEX}">${escapeXml(title)}</text>`,
      `<text x="0" y="42" font-family="${FONT_STACK}" font-size="12" fill="${SUBTLE_TEXT_HEX}">${escapeXml(subtitle)}</text>`,
      '</svg>',
    ].join(''),
    'utf-8'
  )

const formatZoom = (zoom: number): string =>
  Number.isInteger(zoom) ? zoom.toString() : zoom.toFixed(2).replace(/0+$/, '')

const main = async (): Promise<void> =>
{
  const args = parseArgs(process.argv.slice(2))
  const cover = await resolveCover(args.input)
  const zoom = args.zoom ?? cover.defaultZoom

  const sourceMeta = await sharp(cover.coverPath).rotate().metadata()
  if (!sourceMeta.width || !sourceMeta.height)
  {
    process.stderr.write(
      `could not read cover dimensions: ${cover.coverPath}\n`
    )
    process.exit(1)
  }
  const { width: sourceWidth, height: sourceHeight } = sourceMeta

  const framing: TemplateCoverFraming | null =
    zoom > 1 ? computeZoomedCoverFraming(sourceWidth, sourceHeight, zoom) : null

  const previews: SurfacePreview[] = []
  for (const surface of COVER_SURFACES)
  {
    previews.push(
      await renderSurface(
        cover.coverPath,
        sourceWidth,
        sourceHeight,
        surface,
        framing
      )
    )
  }

  const sourceAspect = sourceWidth / sourceHeight
  const headerTitle = `${cover.name} - coverZoom ${formatZoom(zoom)}`
  const headerSubtitle = [
    `${sourceWidth}x${sourceHeight}`,
    `aspect ${sourceAspect.toFixed(3)}`,
    `${cover.source} default ${formatZoom(cover.defaultZoom)}`,
  ].join(' | ')
  const headerSvg = buildHeaderSvg(
    headerTitle,
    headerSubtitle,
    PREVIEW_BASE_WIDTH
  )

  const rows = previews.map((preview) =>
  {
    const aspect = SURFACE_ASPECT_RATIOS[preview.surface]
    const subtitle = `${preview.width}x${preview.height} | surface aspect ${aspect.toFixed(3)}`
    return {
      label: buildLabelSvg(preview.surface, subtitle, PREVIEW_BASE_WIDTH),
      preview,
    }
  })

  const composites: sharp.OverlayOptions[] = []
  let y = TOP_PAD
  composites.push({ input: headerSvg, left: SIDE_PAD, top: y })
  y += HEADER_HEIGHT + ROW_GAP
  for (const row of rows)
  {
    composites.push({ input: row.label, left: SIDE_PAD, top: y })
    y += LABEL_HEIGHT
    composites.push({
      input: row.preview.buffer,
      left: SIDE_PAD,
      top: y,
    })
    y += row.preview.height + ROW_GAP
  }
  const totalHeight = y - ROW_GAP + BOTTOM_PAD
  const totalWidth = SIDE_PAD * 2 + PREVIEW_BASE_WIDTH

  const finalBuffer = await sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 3,
      background: CANVAS_HEX,
    },
  })
    .composite(composites)
    .png()
    .toBuffer()

  const outPath = args.outPath
    ? resolve(process.cwd(), args.outPath)
    : join(DEFAULT_OUT_DIR, `${cover.name}-z${formatZoom(zoom)}.png`)
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, finalBuffer)

  const surfaceLines = previews.map(
    (p) => `    ${p.surface.padEnd(11)} ${p.width}x${p.height}`
  )
  process.stdout.write(
    [
      `wrote ${outPath}`,
      `  source:  ${cover.coverPath}`,
      `  size:    ${sourceWidth}x${sourceHeight} (aspect ${sourceAspect.toFixed(3)})`,
      `  zoom:    ${formatZoom(zoom)} (${cover.source} default ${formatZoom(cover.defaultZoom)}${args.zoom !== null ? ', overridden via --zoom' : ''})`,
      '  surfaces:',
      ...surfaceLines,
      '',
    ].join('\n')
  )
}

main().catch((error) =>
{
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error)
  process.stderr.write(`preview-cover failed: ${message}\n`)
  process.exit(1)
})
