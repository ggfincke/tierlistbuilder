// tests/routing/routerRelativeLinks.test.tsx
// react-router links stay basename-relative under subpath deploys

import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicProfileShowcase } from '@tierlistbuilder/contracts/social/showcase'
import { TopNavAccountMenu } from '~/app/shells/top-nav/TopNavAccountMenu'
import { ProfileShowcaseView } from '~/features/social/profile/ui/ProfileShowcaseView'
import { AccountSettingsPage } from '~/features/social/settings/pages/AccountSettingsPage'
import { makePublicUserMe } from '@tests/fixtures'

const mocks = vi.hoisted(() => ({
  useAuthSession: vi.fn(),
  useProfileDraft: vi.fn(),
}))

vi.mock('~/features/platform/auth/model/useAuthSession', () => ({
  useAuthSession: mocks.useAuthSession,
}))

vi.mock('~/features/platform/auth/model/useProfileDraft', () => ({
  useProfileDraft: mocks.useProfileDraft,
}))

vi.mock('~/features/social/settings/ui/AccountPanel', () => ({
  AccountPanel: () => null,
}))

vi.mock('~/features/social/settings/ui/AppearancePanel', () => ({
  AppearancePanel: () => null,
}))

vi.mock('~/features/social/settings/ui/DataPanel', () => ({
  DataPanel: () => null,
}))

vi.mock('~/features/social/settings/ui/PrivacyPanel', () => ({
  PrivacyPanel: () => null,
}))

vi.mock('~/features/social/settings/ui/ProfilePanel', () => ({
  ProfilePanel: () => null,
}))

const renderWithBasename = (node: ReactNode, route = '/app/'): string =>
  renderToStaticMarkup(
    <MemoryRouter basename="/app" initialEntries={[route]}>
      {node}
    </MemoryRouter>
  )

const showcase = (): PublicProfileShowcase => ({
  placedCount: 1,
  tiers: [
    {
      externalId: 'tier-s',
      name: 'S',
      description: null,
      colorSpec: { kind: 'palette', index: 0 },
      rowColorSpec: null,
      order: 0,
      tiles: [
        {
          boardExternalId: 'board-1',
          rankingSlug: 'ranking-one',
          title: 'Ranking One',
          cover: null,
          mini: null,
        },
      ],
    },
  ],
})

const noop = (): void =>
{}

describe('router-relative React Router links', () =>
{
  beforeEach(() =>
  {
    mocks.useAuthSession.mockReturnValue({
      status: 'signed-in',
      user: makePublicUserMe(),
    })
    mocks.useProfileDraft.mockReturnValue({ dirty: false })
  })

  it('links profile showcase actions and tiles without duplicating basename', () =>
  {
    const html = renderWithBasename(
      <ProfileShowcaseView showcase={showcase()} isSelf />,
      '/app/u/alice'
    )

    expect(html).toContain('href="/app/tier-list"')
    expect(html).toContain('href="/app/rankings/ranking-one"')
    expect(html).not.toContain('/app/app/')
  })

  it('links the account menu profile header without duplicating basename', () =>
  {
    const html = renderWithBasename(
      <TopNavAccountMenu
        session={{ status: 'signed-in', user: makePublicUserMe() }}
        onClose={noop}
        menuId="account-menu"
        onOpenSettings={noop}
        onOpenPreferences={noop}
        onOpenSignIn={noop}
        onSignOut={noop}
      />
    )

    expect(html).toContain('href="/app/u/alice"')
    expect(html).not.toContain('/app/app/')
  })

  it('links account settings back to the workspace root once under basename', () =>
  {
    const html = renderWithBasename(
      <AccountSettingsPage />,
      '/app/settings/account'
    )

    expect(html).toContain('href="/app"')
    expect(html).not.toContain('/app/app')
  })
})
