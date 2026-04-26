// src/features/marketplace/components/Cover.tsx
// cover artwork resolver for template cards, rails, & detail heroes

import type {
  MarketplaceTemplateSummary,
  TemplateCategory,
  TemplateCoverItem,
  TemplateMediaRef,
} from '@tierlistbuilder/contracts/marketplace/template'

import { CATEGORY_META } from '~/features/marketplace/model/categories'
import { InitialsGrid } from './InitialsGrid'
import { Mosaic, type MosaicDensity } from './Mosaic'

export type CoverStyle = 'auto' | 'initials'

interface CoverProps
{
  template: Pick<
    MarketplaceTemplateSummary,
    'coverMedia' | 'category' | 'title'
  > & {
    coverItems?: readonly TemplateCoverItem[]
  }
  density: MosaicDensity
  style?: CoverStyle
}

const SingleImage = ({
  media,
  category,
  title,
}: {
  media: TemplateMediaRef
  category: TemplateCategory
  title: string
}) => (
  <div
    className="absolute inset-0"
    style={{ background: CATEGORY_META[category].gradient }}
    aria-hidden="true"
  >
    <img
      src={media.url}
      alt={`${title} cover`}
      loading="lazy"
      draggable={false}
      className="h-full w-full object-cover"
    />
  </div>
)

const GradientOnly = ({ category }: { category: TemplateCategory }) => (
  <div
    className="absolute inset-0"
    style={{ background: CATEGORY_META[category].gradient }}
    aria-hidden="true"
  />
)

export const Cover = ({ template, density, style = 'auto' }: CoverProps) =>
{
  if (template.coverMedia)
  {
    return (
      <SingleImage
        media={template.coverMedia}
        category={template.category}
        title={template.title}
      />
    )
  }

  const items = template.coverItems ?? []
  if (items.length === 0)
  {
    return <GradientOnly category={template.category} />
  }

  if (style === 'initials')
  {
    return (
      <InitialsGrid
        items={items}
        density={density}
        fallbackGradient={CATEGORY_META[template.category].gradient}
      />
    )
  }

  return (
    <Mosaic
      items={items}
      density={density}
      fallbackGradient={CATEGORY_META[template.category].gradient}
    />
  )
}
