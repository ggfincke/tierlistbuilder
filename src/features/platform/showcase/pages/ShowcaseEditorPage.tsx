// src/features/platform/showcase/pages/ShowcaseEditorPage.tsx
// self-only tlotl editor route entry

import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'

import type { ItemSize } from '@tierlistbuilder/contracts/platform/preferences'
import type { ShowcaseRankingTile } from '@tierlistbuilder/contracts/platform/showcase'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { useSignInPromptStore } from '~/features/platform/auth/model/useSignInPromptStore'
import { useDocumentTitle } from '~/shared/hooks/useDocumentTitle'
import { SignedOutPrompt } from '~/shared/ui/PageState'
import { PAGE_TOP_LEVEL } from '~/shared/ui/pageContainer'
import { SkeletonBlock, SkeletonText } from '~/shared/ui/Skeleton'
import { BoardRenderOverridesProvider } from '~/features/workspace/boards/model/BoardRenderOverridesProvider'
import { TierList } from '~/features/workspace/boards/ui/tier-list/TierList'
import { ShowcasePool } from '~/features/platform/showcase/ui/ShowcasePool'
import { ShowcaseRenderContext } from '~/shared/board-ui/ShowcaseRenderContext'
import { SHOWCASE_PALETTE_ID } from '~/features/platform/showcase/model/showcaseSnapshot'
import { useShowcaseEditor } from '~/features/platform/showcase/model/useShowcaseEditor'

const SHOWCASE_ITEM_SIZE: ItemSize = 'large'
// stable empty map for the render context while the showcase query loads
const EMPTY_TILES: Map<string, ShowcaseRankingTile> = new Map()

const ShowcaseToolbar = ({ onAddTier }: { onAddTier: () => void }) => (
  <div className="flex items-center">
    <button
      type="button"
      onClick={onAddTier}
      className="focus-custom inline-flex items-center gap-1.5 rounded-lg border border-[var(--t-border)] px-3 py-2 text-[13px] font-bold text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
    >
      <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden />
      Add tier
    </button>
  </div>
)

const ShowcaseEditorSkeleton = () => (
  <div className={PAGE_TOP_LEVEL} aria-hidden="true">
    <SkeletonText className="w-48" tone="strong" />
    <div className="mt-6 space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <SkeletonBlock key={index} className="h-20 w-full rounded-lg" />
      ))}
    </div>
  </div>
)

const ShowcaseEditorSignedOut = ({ onSignIn }: { onSignIn: () => void }) => (
  <div className={PAGE_TOP_LEVEL}>
    <SignedOutPrompt
      title={
        <h1 className="text-[28px] font-black text-[var(--t-text)]">
          Your tier list
        </h1>
      }
      body="Sign in to build and save the tier list shown on your profile."
      onSignIn={onSignIn}
    />
  </div>
)

const ShowcaseEditorSignedIn = () =>
{
  const navigate = useNavigate()
  const { board, addTier, flushPendingSave } = useShowcaseEditor()

  const handleDoneEditing = useCallback(() =>
  {
    flushPendingSave()
    navigate(-1)
  }, [flushPendingSave, navigate])

  const tiles = board?.render.tiles
  const renderValue = useMemo(() => ({ tiles: tiles ?? EMPTY_TILES }), [tiles])

  if (!board)
  {
    return <ShowcaseEditorSkeleton />
  }

  return (
    <div className={PAGE_TOP_LEVEL}>
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={handleDoneEditing}
          aria-label="Done editing"
          className="focus-custom grid h-9 w-9 place-items-center rounded-lg border border-[var(--t-border)] text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.2} aria-hidden />
        </button>
        <div>
          <h1 className="text-[22px] font-black tracking-[-0.01em] text-[var(--t-text)]">
            Your tier list
          </h1>
          <p className="text-[13px] text-[var(--t-text-muted)]">
            Drag your published rankings into tiers. The rest stay in the pool.
            Changes save automatically.
          </p>
        </div>
      </div>

      <ShowcaseRenderContext.Provider value={renderValue}>
        <BoardRenderOverridesProvider
          itemSize={SHOWCASE_ITEM_SIZE}
          paletteId={SHOWCASE_PALETTE_ID}
        >
          <TierList
            toolbar={<ShowcaseToolbar onAddTier={addTier} />}
            toolbarPosition="bottom"
            pool={<ShowcasePool />}
          />
        </BoardRenderOverridesProvider>
      </ShowcaseRenderContext.Provider>
    </div>
  )
}

export const ShowcaseEditorPage = () =>
{
  const session = useAuthSession()
  const showSignIn = useSignInPromptStore((state) => state.show)

  useDocumentTitle('Your tier list')

  if (session.status === 'signed-out')
  {
    return <ShowcaseEditorSignedOut onSignIn={showSignIn} />
  }

  if (session.status === 'loading')
  {
    return <ShowcaseEditorSkeleton />
  }

  return <ShowcaseEditorSignedIn key={session.user._id} />
}
