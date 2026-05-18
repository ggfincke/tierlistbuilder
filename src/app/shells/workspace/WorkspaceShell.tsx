// src/app/shells/workspace/WorkspaceShell.tsx
// full interactive workspace shell w/ board UI, modals, panels, & overlays

import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useAppBootstrap } from '~/app/bootstrap/useAppBootstrap'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { useThemeSync } from '~/features/platform/preferences/model/useThemeSync'
import { useModalStack } from '~/app/shells/useModalStack'
import { WorkspaceModalLayer } from './WorkspaceModalLayer'
import { useWorkspaceExportActions } from './useWorkspaceExportActions'
import type { WorkspaceModalPayloads } from './workspaceModals'
import { useRankingPublishAvailability } from '~/features/marketplace/model/publish/useRankingPublishAvailability'
import { BoardActionBar } from '~/features/workspace/boards/ui/board-chrome/BoardActionBar'
import { BoardManager } from '~/features/workspace/boards/ui/board-chrome/BoardManager'
import { BoardHeader } from '~/features/workspace/boards/ui/board-chrome/BoardHeader'
import { BulkActionBar } from '~/features/workspace/boards/ui/board-chrome/BulkActionBar'
import { ConflictResolverModal } from '~/features/workspace/boards/ui/modals/ConflictResolverModal'
import { TierList } from '~/features/workspace/boards/ui/tier-list/TierList'
import { useBoardTransition } from '~/features/workspace/boards/model/useBoardTransition'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { useWarmActiveBoardImages } from '~/features/workspace/boards/model/useWarmActiveBoardImages'
import { getResponsiveToolbarPosition } from '~/shared/overlay/toolbarPosition'
import { AspectRatioPromptProvider } from '~/features/workspace/settings/model/aspect-ratio/AspectRatioPromptProvider'
import { useCurrentPageBackground } from '~/features/workspace/settings/model/useCurrentPageBackground'
import { useCurrentPaletteId } from '~/features/workspace/settings/model/useCurrentPaletteId'
import { useBoardThemeOverrides } from '~/features/workspace/settings/model/useBoardThemeOverrides'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { useGlobalShortcuts } from '~/features/workspace/shortcuts/model/useGlobalShortcuts'
import { LiveRegion } from '~/shared/a11y/LiveRegion'
import { useAboveBreakpoint } from '~/shared/hooks/useAboveBreakpoint'
import { ToastContainer } from '~/shared/notifications/ToastContainer'
import { ErrorBoundary } from '~/shared/ui/ErrorBoundary'

export const WorkspaceShell = () =>
{
  const appReady = useAppBootstrap()
  const paletteId = useCurrentPaletteId()
  const runtimeError = useActiveBoardStore((state) => state.runtimeError)
  const { toolbarPosition: rawToolbarPosition, reducedMotion } =
    usePreferencesStore(
      useShallow((state) => ({
        toolbarPosition: state.toolbarPosition,
        reducedMotion: state.reducedMotion,
      }))
    )
  const pageBackground = useCurrentPageBackground()
  const aboveSm = useAboveBreakpoint()
  const toolbarPosition = getResponsiveToolbarPosition(
    rawToolbarPosition,
    aboveSm
  )

  useThemeSync({ syncTextStyle: false })
  useBoardThemeOverrides()
  useWarmActiveBoardImages(appReady)

  // BoardManager surfaces cloud-only affordances (sync badge, conflict resolver,
  // recently-deleted) only while the user is signed in
  const session = useAuthSession()
  const cloudEnabled = session.status === 'signed-in'

  const { style: boardTransitionStyle, transitionTo } = useBoardTransition()
  const modalStack = useModalStack<WorkspaceModalPayloads>()
  const { state: modalState, open: openModal, close: closeModal } = modalStack
  const exportActions = useWorkspaceExportActions({
    modalState,
    openModal,
    closeModal,
  })

  const { showShortcutsPanel, closeShortcutsPanel } = useGlobalShortcuts({
    onExport: exportActions.runExport,
  })

  const handleAddTier = useCallback(
    () => useActiveBoardStore.getState().addTier(paletteId),
    [paletteId]
  )
  const handleResetBoard = useCallback(
    () => useActiveBoardStore.getState().resetBoard(paletteId),
    [paletteId]
  )
  const handleClearRuntimeError = useCallback(
    () => useActiveBoardStore.getState().clearRuntimeError(),
    []
  )
  const handleOpenSettings = useCallback(
    () => openModal('settings', 'items'),
    [openModal]
  )
  const handleOpenStats = useCallback(() => openModal('stats'), [openModal])
  const handleOpenShare = useCallback(() => openModal('share'), [openModal])
  const activeBoardId = useWorkspaceBoardRegistryStore(
    (state) => state.activeBoardId
  )
  const activeBoardTitle = useActiveBoardStore((state) => state.title)
  const rankingPublishAvailability = useRankingPublishAvailability(
    activeBoardId,
    undefined,
    cloudEnabled && activeBoardId !== null
  )
  const handleOpenPublishRanking = useCallback(() =>
  {
    if (!activeBoardId) return
    openModal('publishRanking', {
      boardExternalId: activeBoardId,
      defaultTitle: activeBoardTitle,
    })
  }, [activeBoardId, activeBoardTitle, openModal])
  const handleOpenPublishTemplate = useCallback(() =>
  {
    openModal('publishTemplate', {
      initialBoardExternalId: activeBoardId ?? null,
    })
  }, [activeBoardId, openModal])
  // mirror the mutation gate before surfacing the ranking publish entry
  const handlePublishRanking =
    cloudEnabled &&
    activeBoardId !== null &&
    rankingPublishAvailability?.canPublish
      ? handleOpenPublishRanking
      : undefined
  // template publish needs sign-in too; PublishModal itself handles the empty
  // boards list (BoardPicker shows a placeholder + the submit guard catches it)
  const handlePublishTemplate = cloudEnabled
    ? handleOpenPublishTemplate
    : undefined
  if (!appReady)
  {
    return (
      <main
        id="app-shell"
        className="ambient-layer min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text)]"
      />
    )
  }

  return (
    <AspectRatioPromptProvider>
      <main
        id="app-shell"
        className="ambient-layer min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text)]"
        style={pageBackground ? { backgroundColor: pageBackground } : undefined}
      >
        <div className="app-content mx-auto w-full max-w-6xl px-3 pb-4 pt-20 sm:px-6 sm:pb-6 sm:pt-24">
          <BoardHeader />

          {runtimeError && (
            <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-[color-mix(in_srgb,var(--t-destructive)_70%,transparent)] bg-[color-mix(in_srgb,var(--t-destructive)_10%,transparent)] px-3 py-2">
              <p className="text-sm text-[color-mix(in_srgb,var(--t-destructive)_30%,var(--t-text))]">
                {runtimeError}
              </p>
              <button
                type="button"
                className="rounded border border-[color-mix(in_srgb,var(--t-destructive-hover)_60%,transparent)] px-2 py-0.5 text-xs text-[color-mix(in_srgb,var(--t-destructive)_30%,var(--t-text))]"
                onClick={handleClearRuntimeError}
              >
                Dismiss
              </button>
            </div>
          )}

          <div style={boardTransitionStyle}>
            <ErrorBoundary section="the board">
              <TierList
                toolbar={
                  <BoardActionBar
                    toolbarPosition={toolbarPosition}
                    onAddTier={handleAddTier}
                    onOpenSettings={handleOpenSettings}
                    onOpenStats={handleOpenStats}
                    onShare={handleOpenShare}
                    exportControls={{
                      status: exportActions.exportStatus,
                      exportingAll: exportActions.exportAllProgress !== null,
                      imageFormat: exportActions.imageFormat,
                      onImageFormatChange: exportActions.setImageFormat,
                      onExport: exportActions.runExport,
                      onCopyToClipboard: exportActions.runCopyToClipboard,
                      onExportAll: exportActions.runExportAll,
                      onAnnotateExport: exportActions.handleAnnotateExport,
                      onPreviewExport: exportActions.handlePreviewExport,
                    }}
                    publish={{
                      ranking: handlePublishRanking,
                      template: handlePublishTemplate,
                      signInRequired: !cloudEnabled,
                    }}
                    onReset={handleResetBoard}
                  />
                }
                toolbarPosition={toolbarPosition}
              />
            </ErrorBoundary>
          </div>
        </div>

        <BoardManager
          toolbarPosition={toolbarPosition}
          onSwitchBoard={transitionTo}
          cloudEnabled={cloudEnabled}
        />
        {session.status === 'signed-in' && (
          <ConflictResolverModal user={session.user} />
        )}
        <WorkspaceModalLayer
          modalStack={modalStack}
          exportStatus={exportActions.exportStatus}
          exportAllProgress={exportActions.exportAllProgress}
          imageFormat={exportActions.imageFormat}
          onImageFormatChange={exportActions.setImageFormat}
          onPreviewDownload={exportActions.handlePreviewDownload}
          onPreviewCopy={exportActions.handlePreviewCopy}
          onPreviewAnnotate={exportActions.handlePreviewAnnotate}
          showShortcutsPanel={showShortcutsPanel}
          onCloseShortcutsPanel={closeShortcutsPanel}
        />
        <BulkActionBar />
        <ToastContainer reducedMotion={reducedMotion} />
        <LiveRegion />
      </main>
    </AspectRatioPromptProvider>
  )
}
