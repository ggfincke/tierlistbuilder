// src/features/marketplace/ui/discovery/Mosaic.tsx
// marketplace cover mosaic — wires template cover items into the shared
// MosaicGrid; plated items float (contain) so logos never crop

import type {
  BoardAutoPlateSettings,
  ImageFit,
} from '@tierlistbuilder/contracts/workspace/board'
import type { TemplateCoverItem } from '@tierlistbuilder/contracts/marketplace/template'
import { FramedItemMedia } from '~/shared/board-ui/FramedItemMedia'
import { resolveCoverTileRender } from '~/shared/board-ui/coverTileRender'
import { MosaicGrid } from '~/shared/board-ui/MosaicGrid'
import type {
  MediaDecoding,
  MediaLoading,
} from '~/shared/board-ui/mediaImageAttrs'

export type MosaicDensity = 'small' | 'default' | 'large' | 'hero'

interface MosaicProps
{
  items: readonly TemplateCoverItem[]
  density: MosaicDensity
  defaultImageFit?: ImageFit | null
  defaultImagePadding?: number | null
  templateAspectRatio?: number | null
  autoPlate?: BoardAutoPlateSettings | null
  loading?: MediaLoading
  decoding?: MediaDecoding
}

// per-density item caps. small packs h-32 rails to ~5x3 (smaller tiles, more
// art); default/large open to 3+ rows so big rosters read as a content wall;
// hero scales for huge templates
const MAX_SLOTS: Record<MosaicDensity, number> = {
  small: 15,
  default: 18,
  large: 24,
  hero: 80,
}

export const Mosaic = ({
  items,
  density,
  defaultImageFit,
  defaultImagePadding,
  templateAspectRatio,
  autoPlate,
  loading = 'lazy',
  decoding = 'async',
}: MosaicProps) => (
  <MosaicGrid
    items={items}
    maxSlots={MAX_SLOTS[density]}
    cellAspect={templateAspectRatio ?? 1}
    renderTile={(item, i) => (
      <CoverTile
        key={`${item.media.externalId}-${i}`}
        item={item}
        defaultImageFit={defaultImageFit}
        defaultImagePadding={defaultImagePadding}
        autoPlate={autoPlate}
        loading={loading}
        decoding={decoding}
      />
    )}
  />
)

interface CoverTileProps
{
  item: TemplateCoverItem
  defaultImageFit: ImageFit | null | undefined
  defaultImagePadding: number | null | undefined
  autoPlate: BoardAutoPlateSettings | null | undefined
  loading: MediaLoading
  decoding: MediaDecoding
}

const CoverTile = ({
  item,
  defaultImageFit,
  defaultImagePadding,
  autoPlate,
  loading,
  decoding,
}: CoverTileProps) =>
{
  const { fit, padding, backgroundColor } = resolveCoverTileRender(item, {
    autoPlate,
    defaultImageFit,
    defaultImagePadding,
  })
  return (
    <FramedItemMedia
      className="bg-[var(--t-media-matte)]"
      imageUrl={item.media.url}
      alt={item.label ?? ''}
      fit={fit}
      transform={item.transform}
      aspectRatio={item.aspectRatio}
      padding={padding}
      backgroundColor={backgroundColor}
      loading={loading}
      decoding={decoding}
    />
  )
}
