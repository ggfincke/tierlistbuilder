// src/app/shells/WorkspaceShell.tsx
// full interactive workspace shell w/ board UI, modals, panels, & overlays

import { useCallback, type MouseEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useAppBootstrap } from '~/app/bootstrap/useAppBootstrap'
import {
  useBoardThemeOverrides,
  useThemeSync,
} from '~/app/bootstrap/useThemeSync'
import { AppTopNav } from '~/app/shells/AppTopNav'
import { useModalStack } from '~/app/shells/useModalStack'
import { WorkspaceModalLayer } from '~/app/shells/WorkspaceModalLayer'
import { useWorkspaceExportActions } from '~/app/shells/useWorkspaceExportActions'
import type { WorkspaceModalPayloads } from '~/app/shells/workspaceModals'
import { BoardActionBar } from '~/features/workspace/boards/ui/BoardActionBar'
import { BoardManager } from '~/features/workspace/boards/ui/BoardManager'
import { BoardHeader } from '~/features/workspace/boards/ui/BoardHeader'
import { BulkActionBar } from '~/features/workspace/boards/ui/BulkActionBar'
import { TierList } from '~/features/workspace/boards/ui/TierList'
import { useBoardTransition } from '~/features/workspace/boards/model/useBoardTransition'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { getResponsiveToolbarPosition } from '~/shared/layout/toolbarPosition'
import { getWorkspacePath } from '~/app/routes/pathname'
import { AspectRatioPromptProvider } from '~/features/workspace/settings/model/AspectRatioPromptProvider'
import { useCurrentPageBackground } from '~/features/workspace/settings/model/useCurrentPageBackground'
import { useCurrentPaletteId } from '~/features/workspace/settings/model/useCurrentPaletteId'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { useGlobalShortcuts } from '~/features/workspace/shortcuts/model/useGlobalShortcuts'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { useCloudSync } from '~/features/platform/sync/orchestration/useCloudSync'
import { CLOUD_SYNC_ENABLED } from '~/features/platform/sync/lib/cloudSyncConfig'
import { LiveRegion } from '~/shared/a11y/LiveRegion'
import { useAboveBreakpoint } from '~/shared/hooks/useViewportWidth'
import { ToastContainer } from '~/shared/notifications/ToastContainer'
import { ErrorBoundary } from '~/shared/ui/ErrorBoundary'

export const WorkspaceShell = () =>
{
  const appReady = useAppBootstrap()
  const paletteId = useCurrentPaletteId()
  const { runtimeError, clearRuntimeError, addTier, resetBoard } =
    useActiveBoardStore(
      useShallow((state) => ({
        runtimeError: state.runtimeError,
        clearRuntimeError: state.clearRuntimeError,
        addTier: state.addTier,
        resetBoard: state.resetBoard,
      }))
    )
  const { toolbarPosition: rawToolbarPosition, reducedMotion } =
    useSettingsStore(
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

  const authSession = useAuthSession()
  const signedInUser =
    authSession.status === 'signed-in' ? authSession.user : null
  const cloudEnabled = signedInUser !== null && CLOUD_SYNC_ENABLED
  useCloudSync(signedInUser)

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
    () => addTier(paletteId),
    [addTier, paletteId]
  )
  const handleResetBoard = useCallback(
    () => resetBoard(paletteId),
    [paletteId, resetBoard]
  )
  const handleOpenSettings = useCallback(
    () => openModal('settings', 'items'),
    [openModal]
  )
  const handleOpenStats = useCallback(() => openModal('stats'), [openModal])
  const handleOpenShare = useCallback(() => openModal('share'), [openModal])
  const handleSkipToBoard = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) =>
    {
      event.preventDefault()

      const board = document.getElementById('tier-list')

      if (!(board instanceof HTMLElement))
      {
        return
      }

      board.scrollIntoView({ block: 'start' })
      board.focus({ preventScroll: true })
      window.history.replaceState(null, '', '#tier-list')
    },
    []
  )

  if (!appReady)
  {
    return (
      <main
        id="app-shell"
        className="min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text)]"
      />
    )
  }

  return (
    <AspectRatioPromptProvider>
      <main
        id="app-shell"
        className="min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text)]"
        style={pageBackground ? { backgroundColor: pageBackground } : undefined}
      >
        <a
          href={`${getWorkspacePath()}#tier-list`}
          onClick={handleSkipToBoard}
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--t-accent)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--t-accent-foreground)] focus:shadow-lg"
        >
          Skip to board
        </a>
        <AppTopNav />
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
                onClick={clearRuntimeError}
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
                    cloudEnabled={cloudEnabled}
                    exportStatus={exportActions.exportStatus}
                    exportingAll={exportActions.exportAllProgress !== null}
                    onAddTier={handleAddTier}
                    onOpenSettings={handleOpenSettings}
                    onOpenStats={handleOpenStats}
                    onExport={exportActions.runExport}
                    onCopyToClipboard={exportActions.runCopyToClipboard}
                    onExportAll={exportActions.runExportAll}
                    onAnnotateExport={exportActions.handleAnnotateExport}
                    onPreviewExport={exportActions.handlePreviewExport}
                    onShare={handleOpenShare}
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
          cloudEnabled={cloudEnabled}
          onSwitchBoard={transitionTo}
        />
        <WorkspaceModalLayer
          modalStack={modalStack}
          signedInUser={signedInUser}
          exportStatus={exportActions.exportStatus}
          exportAllProgress={exportActions.exportAllProgress}
          previewFormat={exportActions.previewFormat}
          onPreviewFormatChange={exportActions.setPreviewFormat}
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
