// packages/contracts/lib/coverMedia.ts
// shared cover media & framing primitives

export interface TemplateMediaRef
{
  externalId: string
  contentHash: string
  url: string
  width: number
  height: number
  mimeType: string
}

// per-surface cover framings; authors crop one master image per surface.
// rect coords are normalized against source dimensions; higher-res replacements
// keep framing. values may sit outside [0, 1] when zoomed below cover-fit
export const COVER_SURFACES = ['browseHero', 'detailHero', 'card'] as const

export type CoverSurface = (typeof COVER_SURFACES)[number]

// canonical aspect ratios per surface; gallery hero ~16:9, detail hero ~4:3,
// default card ~16:10. live containers may drift; FramedCoverImage covers
// via object-cover
export const SURFACE_ASPECT_RATIOS: Record<CoverSurface, number> = {
  browseHero: 16 / 9,
  detailHero: 4 / 3,
  card: 16 / 10,
}

export interface CoverFrame
{
  x: number
  y: number
  width: number
  height: number
}

export interface TemplateCoverFraming
{
  browseHero: CoverFrame | null
  detailHero: CoverFrame | null
  card: CoverFrame | null
}

export const FULL_COVER_FRAME: CoverFrame = { x: 0, y: 0, width: 1, height: 1 }

// frames are normalized to source-image coords but may extend outside [0, 1]
// when the user zooms out below cover-fit -> renderer letterboxes the gap
// w/ --t-media-matte. only finite + positive extents are required
export const isValidCoverFrame = (frame: CoverFrame): boolean =>
  Number.isFinite(frame.x) &&
  Number.isFinite(frame.y) &&
  Number.isFinite(frame.width) &&
  Number.isFinite(frame.height) &&
  frame.width > 0 &&
  frame.height > 0
