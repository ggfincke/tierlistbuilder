// src/features/marketplace/components/Cover.tsx
// cover artwork resolver for template cards, rails, & detail heroes — picks a
// per-surface frame from coverFraming when surface is set, else full image

import type {
  CoverSurface,
  MarketplaceTemplateSummary,
  TemplateCoverFraming,
  TemplateCoverItem,
} from '@tierlistbuilder/contracts/marketplace/template'

import { FramedCoverImage } from './FramedCoverImage'
import { InitialsGrid } from './InitialsGrid'
import {
  MediaMatteFrame,
  type MediaDecoding,
  type MediaLoading,
} from './MediaMatteFrame'
import { Mosaic, type MosaicDensity } from './Mosaic'

export type CoverStyle = 'auto' | 'initials'

interface CoverProps
{
  template: Pick<MarketplaceTemplateSummary, 'coverMedia' | 'title'> & {
    coverFraming?: TemplateCoverFraming | null
    coverItems?: readonly TemplateCoverItem[]
    defaultItemImageFit?: MarketplaceTemplateSummary['defaultItemImageFit']
    itemAspectRatio?: MarketplaceTemplateSummary['itemAspectRatio']
  }
  density: MosaicDensity
  style?: CoverStyle
  // when set, picks the matching frame from coverFraming. omit on surfaces w/o
  // a per-surface bake (library cards, drafts) — runtime falls back to a full-
  // image object-cover into the surface container
  surface?: CoverSurface
  loading?: MediaLoading
  decoding?: MediaDecoding
}

const MatteOnly = () => <MediaMatteFrame className="absolute inset-0" />

export const Cover = ({
  template,
  density,
  style = 'auto',
  surface,
  loading,
  decoding,
}: CoverProps) =>
{
  if (template.coverMedia)
  {
    const media = template.coverMedia
    const frame = surface ? (template.coverFraming?.[surface] ?? null) : null
    return (
      <FramedCoverImage
        src={media.url}
        alt={`${template.title} cover`}
        sourceWidth={media.width}
        sourceHeight={media.height}
        frame={frame}
        loading={loading}
        decoding={decoding}
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
