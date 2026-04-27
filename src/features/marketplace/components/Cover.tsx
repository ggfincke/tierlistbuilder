// src/features/marketplace/components/Cover.tsx
// cover artwork resolver for template cards, rails, & detail heroes

import type {
  MarketplaceTemplateSummary,
  TemplateCoverItem,
  TemplateMediaRef,
} from '@tierlistbuilder/contracts/marketplace/template'

import { InitialsGrid } from './InitialsGrid'
import { MediaMatteFrame } from './MediaMatteFrame'
import { Mosaic, type MosaicDensity } from './Mosaic'

export type CoverStyle = 'auto' | 'initials'

interface CoverProps
{
  template: Pick<MarketplaceTemplateSummary, 'coverMedia' | 'title'> & {
    coverItems?: readonly TemplateCoverItem[]
  }
  density: MosaicDensity
  style?: CoverStyle
}

const SingleImage = ({
  media,
  title,
}: {
  media: TemplateMediaRef
  title: string
}) => (
  <MediaMatteFrame
    src={media.url}
    alt={`${title} cover`}
    className="absolute inset-0"
  />
)

const MatteOnly = () => <MediaMatteFrame className="absolute inset-0" />

export const Cover = ({ template, density, style = 'auto' }: CoverProps) =>
{
  if (template.coverMedia)
  {
    return <SingleImage media={template.coverMedia} title={template.title} />
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

  return <Mosaic items={items} density={density} />
}
