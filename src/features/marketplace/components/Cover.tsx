// src/features/marketplace/components/Cover.tsx
// resolves a template's cover artwork — explicit coverMedia first, then a
// mosaic of item images, then a category gradient as final fallback

import type {
  MarketplaceTemplateSummary,
  TemplateCategory,
  TemplateMediaRef,
} from '@tierlistbuilder/contracts/marketplace/template'

import { CATEGORY_META } from '~/features/marketplace/model/categories'
import { Mosaic, type MosaicDensity } from './Mosaic'

interface CoverProps
{
  template: Pick<
    MarketplaceTemplateSummary,
    'coverMedia' | 'category' | 'title'
  > & {
    coverItems?: readonly TemplateMediaRef[]
  }
  density: MosaicDensity
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
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/55" />
  </div>
)

const GradientOnly = ({ category }: { category: TemplateCategory }) => (
  <div
    className="absolute inset-0"
    style={{ background: CATEGORY_META[category].gradient }}
    aria-hidden="true"
  >
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/55" />
  </div>
)

export const Cover = ({ template, density }: CoverProps) =>
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
  if (template.coverItems && template.coverItems.length > 0)
  {
    return (
      <Mosaic
        items={template.coverItems}
        density={density}
        fallbackGradient={CATEGORY_META[template.category].gradient}
      />
    )
  }
  return <GradientOnly category={template.category} />
}
