// src/features/workspace/boards/ui/SaveOrPublishMenu.tsx
// save preset & marketplace publish dropdown for the board action bar

import { useCallback, useState } from 'react'
import {
  BookmarkPlus,
  LogIn,
  Send,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react'

import { promptSignIn } from '~/features/platform/auth/model/useSignInPromptStore'
import { preloadPublishModal } from '~/features/marketplace/components/publish/loadPublishModal'
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
  OverlayDivider,
  OverlayMenuItem,
  OverlayMenuSurface,
} from '~/shared/overlay/OverlaySurface'
import { ActionButton } from '~/shared/ui/ActionButton'
import type {
  BoardActionBarMenuPosition,
  BoardActionBarPublishControls,
} from './BoardActionBar.types'

type SaveMenuId = 'root'

const SAVE_MENU_DEFINITIONS: readonly NestedMenuDefinition<SaveMenuId>[] = [
  { id: 'root' },
]

interface PublishMenuItem
{
  key: 'ranking' | 'template'
  label: string
  Icon: LucideIcon
  onSelect?: () => void
}

interface SaveOrPublishMenuProps
{
  menuPos: BoardActionBarMenuPosition
  publish?: BoardActionBarPublishControls
}

// "Sign in" affordance appended to publish menu items while signed-out
const SignInHint = () => (
  <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-[var(--t-text-faint)]">
    <LogIn className="h-3 w-3" strokeWidth={2} aria-hidden />
    Sign in
  </span>
)

export const SaveOrPublishMenu = ({
  menuPos,
  publish,
}: SaveOrPublishMenuProps) =>
{
  const publishRanking = publish?.ranking
  const publishTemplate = publish?.template
  const publishSignInRequired = publish?.signInRequired ?? false
  const publishMenuItems: readonly PublishMenuItem[] = [
    {
      key: 'ranking',
      label: 'Publish Ranking',
      Icon: Send,
      onSelect: publishSignInRequired ? promptSignIn : publishRanking,
    },
    {
      key: 'template',
      label: 'Publish as Template',
      Icon: UploadCloud,
      onSelect: publishSignInRequired ? promptSignIn : publishTemplate,
    },
  ]
  const visiblePublishMenuItems = publishMenuItems.filter(
    ({ onSelect }) => publishSignInRequired || onSelect !== undefined
  )
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
          label="Save or publish"
          title="Save or publish options"
          onClick={() => toggleSaveMenu('root')}
          onFocus={publishTemplate ? preloadPublishModal : undefined}
          onPointerEnter={publishTemplate ? preloadPublishModal : undefined}
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
            aria-label="Save or publish options"
            className={`${menuPos.primary} flex flex-col ${menuPos.animationClass} text-sm shadow-md shadow-black/30 ${menuPos.bridge}`}
          >
            {visiblePublishMenuItems.map(({ key, label, Icon, onSelect }) => (
              <OverlayMenuItem
                key={key}
                onClick={() =>
                {
                  closeSaveMenu()
                  onSelect?.()
                }}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
                {publishSignInRequired && <SignInHint />}
              </OverlayMenuItem>
            ))}
            {visiblePublishMenuItems.length > 0 && <OverlayDivider />}
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
