// src/features/workspace/boards/ui/menus/SaveOrPublishMenu.tsx
// save preset dropdown for the board action bar

import { useCallback, useState } from 'react'
import { BookmarkPlus } from 'lucide-react'

import { extractPresetFromBoard } from '~/features/workspace/tier-presets/model/tierPresets'
import { useTierPresetStore } from '~/features/workspace/tier-presets/model/useTierPresetStore'
import { SavePresetModal } from '~/features/workspace/tier-presets/ui/SavePresetModal'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { extractBoardData } from '~/shared/board-data/boardSnapshot'
import {
  useNestedDropdown,
  type NestedMenuDefinition,
} from '~/shared/overlay/nestedMenus'
import {
  OverlayMenuItem,
  OverlayMenuSurface,
} from '~/shared/overlay/OverlaySurface'
import { ActionButton } from '~/shared/ui/ActionButton'
import type { BoardActionBarMenuPosition } from '../board-chrome/BoardActionBar.types'

type SaveMenuId = 'root'

const SAVE_MENU_DEFINITIONS: readonly NestedMenuDefinition<SaveMenuId>[] = [
  { id: 'root' },
]

interface SaveOrPublishMenuProps
{
  menuPos: BoardActionBarMenuPosition
}

export const SaveOrPublishMenu = ({ menuPos }: SaveOrPublishMenuProps) =>
{
  const addPreset = useTierPresetStore((state) => state.addPreset)
  const boardTitle = useActiveBoardStore((state) => state.title)
  const [showSavePreset, setShowSavePreset] = useState(false)
  const {
    buttonRef: saveButtonRef,
    menuRef: saveMenuRef,
    dialogId: saveDialogId,
    closeAllMenus: closeSaveMenu,
    isRootOpen: showSaveMenu,
    toggleMenu: toggleSaveMenu,
  } = useNestedDropdown({
    rootId: 'root',
    definitions: SAVE_MENU_DEFINITIONS,
  })

  const handleSavePreset = useCallback(
    (presetName: string) =>
    {
      const data = extractBoardData(useActiveBoardStore.getState())
      addPreset(extractPresetFromBoard(data, presetName))
    },
    [addPreset]
  )

  return (
    <>
      <div className="relative">
        <ActionButton
          ref={saveButtonRef}
          label="Save preset"
          title="Save preset options"
          onClick={() => toggleSaveMenu('root')}
          hasPopup="dialog"
          expanded={showSaveMenu}
          controlsId={saveDialogId}
          active={showSaveMenu}
          withDropdownIndicator
        >
          <BookmarkPlus className="h-5 w-5" strokeWidth={1.8} />
        </ActionButton>

        {showSaveMenu && (
          <OverlayMenuSurface
            id={saveDialogId}
            ref={saveMenuRef}
            role="dialog"
            aria-label="Save preset options"
            className={`${menuPos.primary} flex flex-col ${menuPos.animationClass} text-sm shadow-md shadow-black/30 ${menuPos.bridge}`}
          >
            <OverlayMenuItem
              onClick={() =>
              {
                closeSaveMenu()
                setShowSavePreset(true)
              }}
            >
              <BookmarkPlus className="h-3.5 w-3.5 shrink-0" />
              Save as Preset
            </OverlayMenuItem>
          </OverlayMenuSurface>
        )}
      </div>

      {showSavePreset && (
        <SavePresetModal
          defaultName={boardTitle}
          onClose={() => setShowSavePreset(false)}
          onSave={handleSavePreset}
        />
      )}
    </>
  )
}
