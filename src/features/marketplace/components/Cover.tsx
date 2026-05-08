// src/features/marketplace/components/Cover.tsx
// cover artwork resolver for template cards, rails, & detail heroes

import type {
  MarketplaceTemplateSummary,
  TemplateCoverItem,
  TemplateMediaRef,
} from '@tierlistbuilder/contracts/marketplace/template'

import { InitialsGrid } from './InitialsGrid'
import {
  MediaMatteFrame,
  type MediaDecoding,
  type MediaLoading,
} from './MediaMatteFrame'
import { Mosaic, type MosaicDensity } from './Mosaic'
import { isWideHeroCoverMedia } from './coverMedia'

export type CoverStyle = 'auto' | 'initials'

interface CoverProps
{
  template: Pick<MarketplaceTemplateSummary, 'coverMedia' | 'title'> & {
    coverItems?: readonly TemplateCoverItem[]
    defaultItemImageFit?: MarketplaceTemplateSummary['defaultItemImageFit']
    itemAspectRatio?: MarketplaceTemplateSummary['itemAspectRatio']
  }
  density: MosaicDensity
  style?: CoverStyle
  loading?: MediaLoading
  decoding?: MediaDecoding
  // 0..1 vertical center of the wide-hero foreground; default 0.5
  wideHeroFocusY?: number
  // foreground width as a multiplier of cover-container width. >1 bleeds past
  // the sides (cropped by overflow-hidden). higher values also raise the
  // banner's rendered height since height scales w/ width via aspect ratio
  wideHeroScale?: number
}

const SingleImage = ({
  media,
  title,
  density,
  loading,
  decoding,
  wideHeroFocusY = 0.5,
  wideHeroScale = 1.8,
}: {
  media: TemplateMediaRef
  title: string
  density: MosaicDensity
  loading?: MediaLoading
  decoding?: MediaDecoding
  wideHeroFocusY?: number
  wideHeroScale?: number
}) =>
{
  const alt = `${title} cover`

  if (density === 'hero' && isWideHeroCoverMedia(media))
  {
    return (
      <div className="absolute inset-0 overflow-hidden bg-[var(--t-media-matte)]">
        <img
          src={media.url}
          alt=""
          width={media.width}
          height={media.height}
          loading={loading}
          decoding={decoding}
          draggable={false}
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-xl saturate-125"
        />
        <div className="absolute inset-0 bg-black/30" />
        <img
          src={media.url}
          alt={alt}
          width={media.width}
          height={media.height}
          loading={loading}
          decoding={decoding}
          draggable={false}
          style={{
            top: `${wideHeroFocusY * 100}%`,
            width: `${wideHeroScale * 100}%`,
          }}
          className="absolute left-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 shadow-2xl shadow-black/40"
        />
      </div>
    )
  }

  return (
    <MediaMatteFrame
      src={media.url}
      alt={alt}
      width={media.width}
      height={media.height}
      loading={loading}
      decoding={decoding}
      className="absolute inset-0"
    />
  )
}

const MatteOnly = () => <MediaMatteFrame className="absolute inset-0" />

export const Cover = ({
  template,
  density,
  style = 'auto',
  loading,
  decoding,
  wideHeroFocusY,
  wideHeroScale,
}: CoverProps) =>
{
  if (template.coverMedia)
  {
    return (
      <SingleImage
        media={template.coverMedia}
        title={template.title}
        density={density}
        loading={loading}
        decoding={decoding}
        wideHeroFocusY={wideHeroFocusY}
        wideHeroScale={wideHeroScale}
      />
    )
  }

  const items = template.coverItems ?? []
  if (items.length === 0)
  {
    return <MatteOnly />
  }

  if (style === 'initials')
  {
    return <InitialsGrid items={items} density={density} />
  }

  return (
    <Mosaic
      items={items}
      density={density}
      defaultImageFit={template.defaultItemImageFit ?? null}
      templateAspectRatio={template.itemAspectRatio ?? null}
      loading={loading}
      decoding={decoding}
    />
  )
}
