// src/components/board/ItemContent.tsx
// shared image-vs-text item rendering — used by board tiles, drag overlay, & deleted items

import { getTextColor } from '../../utils/color'

interface ItemContentProps
{
  item: {
    imageUrl?: string
    label?: string
    backgroundColor?: string
    altText?: string
  }
  // "default" for board tiles & drag overlay, "compact" for deleted items
  variant?: 'default' | 'compact'
  // show label overlay on image items (only used by board tiles)
  showLabel?: boolean
}

export const ItemContent = ({
  item,
  variant = 'default',
  showLabel = false,
}: ItemContentProps) =>
{
  const bgColor = item.backgroundColor

  if (item.imageUrl)
  {
    return (
      <>
        <img
          src={item.imageUrl}
          alt={item.altText ?? item.label ?? 'Tier item'}
          className="h-full w-full object-cover"
          draggable={false}
        />
        {showLabel && item.label && (
          <div className="absolute right-0 bottom-0 left-0 bg-black/60 px-1 py-0.5">
            <span className="block truncate text-center text-[10px] text-white">
              {item.label}
            </span>
          </div>
        )}
      </>
    )
  }

  return (
    <div
      className={`flex h-full w-full items-center justify-center ${
        bgColor ? '' : 'bg-[var(--t-bg-surface)] text-[var(--t-text)]'
      } ${variant === 'compact' ? 'p-0.5' : 'p-1'}`}
      style={
        bgColor
          ? { backgroundColor: bgColor, color: getTextColor(bgColor) }
          : undefined
      }
    >
      <span
        className={`font-semibold break-words text-center [overflow-wrap:anywhere] ${
          variant === 'compact' ? 'text-[10px] leading-tight' : 'text-xs'
        }`}
      >
        {item.label}
      </span>
    </div>
  )
}
