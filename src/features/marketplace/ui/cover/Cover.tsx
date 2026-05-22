// src/features/marketplace/ui/cover/Cover.tsx
// cover artwork resolver for template cards, rails, & detail heroes — picks a
// per-surface frame from coverFraming when surface is set, else full image

import type {
  CoverSurface,
  MarketplaceTemplateSummary,
  TemplateCoverFraming,
  TemplateCoverItem,
} from '@tierlistbuilder/contracts/marketplace/template'

import { FramedCoverImage } from '~/shared/board-ui/FramedCoverImage'
import type {
  MediaDecoding,
  MediaLoading,
} from '~/shared/board-ui/mediaImageAttrs'
import { InitialsGrid } from '../discovery/InitialsGrid'
import { MediaMatteFrame } from '../cover/MediaMatteFrame'
import { Mosaic, type MosaicDensity } from '../discovery/Mosaic'

export type CoverStyle = 'auto' | 'initials'

interface CoverProps
{
  template: Pick<MarketplaceTemplateSummary, 'coverMedia' | 'title'> & {
    coverFraming?: TemplateCoverFraming | null
    coverItems?: readonly TemplateCoverItem[]
    defaultItemImageFit?: MarketplaceTemplateSummary['defaultItemImageFit']
    defaultItemImagePadding?: MarketplaceTemplateSummary['defaultItemImagePadding']
    itemAspectRatio?: MarketplaceTemplateSummary['itemAspectRatio']
    autoPlate?: MarketplaceTemplateSummary['autoPlate']
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
      defaultImagePadding={template.defaultItemImagePadding ?? null}
      templateAspectRatio={template.itemAspectRatio ?? null}
      autoPlate={template.autoPlate ?? null}
      loading={loading}
      decoding={decoding}
    />
  )
}
