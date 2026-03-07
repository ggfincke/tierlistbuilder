// src/components/ui/Toolbar.tsx
// page header — displays the board title from the store
import { useTierListStore } from '../../store/useTierListStore'
import { DEFAULT_TITLE } from '../../utils/constants'

export const Toolbar = () => {
  const title = useTierListStore((state) => state.title)
  // fall back to a placeholder when the stored title is blank
  const displayTitle = title.trim() || DEFAULT_TITLE

  return (
    <header className="px-3 pb-2 pt-3 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-100 sm:text-[2.15rem]">
        {displayTitle}
      </h1>
    </header>
  )
}
