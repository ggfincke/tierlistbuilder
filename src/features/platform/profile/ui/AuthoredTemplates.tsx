// src/features/platform/profile/ui/AuthoredTemplates.tsx
// grid of public templates a profile's user has published

import type { MarketplaceTemplateSummary } from '@tierlistbuilder/contracts/marketplace/template'
import { Card } from '~/features/marketplace/ui/cards/Card'
import { BOARDS_ROUTE_PATH } from '~/shared/routes/pathname'
import { ButtonLink } from '~/shared/ui/Button'
import { EmptyCard } from '~/shared/ui/EmptyCard'
import { ProfileSectionHeader } from './ProfileSectionHeader'

interface AuthoredTemplatesProps
{
  templates: MarketplaceTemplateSummary[]
  hasMore: boolean
  displayName: string
  isSelf: boolean
}

export const AuthoredTemplates = ({
  templates,
  hasMore,
  displayName,
  isSelf,
}: AuthoredTemplatesProps) =>
{
  if (templates.length === 0)
  {
    return (
      <section>
        <ProfileSectionHeader title="Templates" />
        <EmptyCard
          title={isSelf ? 'No published templates yet' : 'Nothing here yet'}
          body={
            isSelf
              ? 'Publish a board as a template and it will show up on your profile.'
              : `${displayName} hasn't published any public templates yet.`
          }
          action={
            isSelf ? (
              <ButtonLink
                to={BOARDS_ROUTE_PATH}
                size="sm"
                className="rounded-lg text-[12px] font-bold"
              >
                Go to my boards
              </ButtonLink>
            ) : undefined
          }
        />
      </section>
    )
  }

  return (
    <section>
      <ProfileSectionHeader
        title="Templates"
        count={hasMore ? `${templates.length}+` : templates.length}
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {templates.map((template) => (
          <Card key={template.slug} template={template} size="small" />
        ))}
      </div>
    </section>
  )
}
