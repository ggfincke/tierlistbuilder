// src/features/marketplace/ui/consensus/item/AggregateItemThumb.tsx
// shared thumb renderer for aggregate-item surfaces (tier rows, rail cards,
// popover) — frames published media via ItemContent for grid parity

import type {
  BoardItemDisplaySettings,
  ImageFit,
} from '@tierlistbuilder/contracts/workspace/board'
import { LABEL_FONT_SIZE_PX_DEFAULT } from '@tierlistbuilder/contracts/workspace/board'
import type { MarketplaceTemplateRankingAggregateItem } from '@tierlistbuilder/contracts/marketplace/rankingAggregate'
import { ItemContent } from '~/shared/board-ui/ItemContent'
import { resolveLabelDisplay } from '~/shared/board-ui/labelDisplay'

export interface AggregateItemFrame
{
  aspectRatio: number
  defaultFit: ImageFit
}

interface AggregateItemThumbProps
{
  row: MarketplaceTemplateRankingAggregateItem
  frame: AggregateItemFrame
  displaySettings: BoardItemDisplaySettings
  size: number
  // tier-row context drops the card chrome (border/bg/rounded) so items sit
  // flush on the tier color, matching the editor board surface
  bare?: boolean
}

// keep the slot styling shared so a 36px thumb in the rail matches a 56px
// thumb in the tier row visually
export const AggregateItemThumb = ({
  row,
  frame,
  displaySettings,
  size,
  bare = false,
}: AggregateItemThumbProps) =>
{
  const labelDisplay = resolveLabelDisplay({
    itemLabel: row.label ?? undefined,
    itemOptions: undefined,
    boardSettings: displaySettings.labels ?? undefined,
    globalLabelDefaults: {
      showLabels: false,
      placementMode: 'overlay',
      fontSizePx: LABEL_FONT_SIZE_PX_DEFAULT,
    },
  })
  const chromeClass = bare
    ? 'relative shrink-0 overflow-hidden'
    : 'relative shrink-0 overflow-hidden rounded-md border border-[var(--t-border)] bg-[var(--t-bg-page)]'
  return (
    <div
      className={chromeClass}
      style={{
        width: size,
        height: size / frame.aspectRatio,
        aspectRatio: frame.aspectRatio,
      }}
    >
      <ItemContent
        item={{
          imageUrl: row.media?.url,
          label: row.label ?? undefined,
          backgroundColor: row.backgroundColor ?? undefined,
          mediaPlate: row.mediaPlate ?? undefined,
          altText: row.altText ?? undefined,
          aspectRatio: row.aspectRatio ?? undefined,
          transform: row.transform ?? undefined,
          imagePadding: row.imagePadding ?? undefined,
        }}
        autoPlate={displaySettings.autoPlate}
        defaultItemImagePadding={
          displaySettings.defaultItemImagePadding ?? undefined
        }
        label={labelDisplay}
        fit={row.imageFit ?? frame.defaultFit}
        frameAspectRatio={frame.aspectRatio}
      />
    </div>
  )
}
