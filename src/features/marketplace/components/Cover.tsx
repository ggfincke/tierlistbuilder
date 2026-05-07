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
}

const SingleImage = ({
  media,
  title,
  loading,
  decoding,
}: {
  media: TemplateMediaRef
  title: string
  loading?: MediaLoading
  decoding?: MediaDecoding
}) => (
  <MediaMatteFrame
    src={media.url}
    alt={`${title} cover`}
    width={media.width}
    height={media.height}
    loading={loading}
    decoding={decoding}
    className="absolute inset-0"
  />
)

const MatteOnly = () => <MediaMatteFrame className="absolute inset-0" />

export const Cover = ({
  template,
  density,
  style = 'auto',
  loading,
  decoding,
}: CoverProps) =>
{
  if (template.coverMedia)
  {
    return (
      <SingleImage
        media={template.coverMedia}
        title={template.title}
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
