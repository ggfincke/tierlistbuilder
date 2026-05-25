// src/features/platform/profile/ui/ProfileShowcaseView.tsx
// read-only tlotl section on the public profile — StaticBoard w/ clickable
// tiles, or a self-only build CTA when empty

import { Pencil } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

import { LABEL_FONT_SIZE_PX_DEFAULT } from '@tierlistbuilder/contracts/workspace/board'
import type { PublicProfileShowcase } from '@tierlistbuilder/contracts/platform/showcase'
import {
  getRankingDetailPath,
  getShowcaseEditPath,
} from '~/shared/routes/pathname'
import {
  StaticBoard,
  type StaticBoardAppearance,
} from '~/shared/board-ui/StaticBoard'
import { ShowcaseRenderContext } from '~/shared/board-ui/ShowcaseRenderContext'
import { EmptyCard } from '~/shared/ui/EmptyCard'
import { publicShowcaseToSnapshot } from '~/features/platform/showcase/model/showcaseSnapshot'
import { ProfileSectionHeader } from './ProfileSectionHeader'

const SECTION_TITLE = 'Tier list of tier lists'

// read-only render; tiles draw their own title so board labels stay off
const SHOWCASE_APPEARANCE: StaticBoardAppearance = {
  itemSize: 'medium',
  showLabels: false,
  defaultLabelPlacementMode: 'overlay',
  defaultLabelFontSizePx: LABEL_FONT_SIZE_PX_DEFAULT,
  itemShape: 'square',
  compactMode: false,
  labelWidth: 'default',
  paletteId: 'classic',
  textStyleId: 'default',
  tierLabelBold: true,
  tierLabelItalic: false,
  tierLabelFontSize: 'medium',
}

const ShowcaseEditLink = ({ label }: { label: string }) => (
  <Link
    to={getShowcaseEditPath()}
    className="focus-custom inline-flex items-center gap-1.5 rounded-lg border border-[var(--t-border)] px-3 py-1.5 text-[12px] font-bold text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
  >
    <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
    {label}
  </Link>
)

interface ProfileShowcaseViewProps
{
  showcase: PublicProfileShowcase | null
  isSelf: boolean
}

export const ProfileShowcaseView = ({
  showcase,
  isSelf,
}: ProfileShowcaseViewProps) =>
{
  if (!showcase || showcase.placedCount === 0)
  {
    // visitors never see an empty showcase
    if (!isSelf) return null
    return (
      <section className="mt-10">
        <ProfileSectionHeader title={SECTION_TITLE} />
        <EmptyCard
          title="Rank your tier lists"
          body="Publish a ranking, then drag your tier lists into tiers to headline your profile."
          action={<ShowcaseEditLink label="Build your tier list" />}
        />
      </section>
    )
  }

  const { snapshot, render } = publicShowcaseToSnapshot(showcase)
  const linkTile = (rankingSlug: string, children: ReactNode): ReactNode => (
    <Link
      to={getRankingDetailPath(rankingSlug)}
      className="focus-custom block h-full w-full"
    >
      {children}
    </Link>
  )

  return (
    <section className="mt-10">
      <ProfileSectionHeader
        title={SECTION_TITLE}
        action={isSelf ? <ShowcaseEditLink label="Edit" /> : undefined}
      />
      <ShowcaseRenderContext.Provider value={{ ...render, linkTile }}>
        <div className="overflow-x-auto rounded-xl border border-[var(--t-border)]">
          <StaticBoard data={snapshot} appearance={SHOWCASE_APPEARANCE} />
        </div>
      </ShowcaseRenderContext.Provider>
    </section>
  )
}
