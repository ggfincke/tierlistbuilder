// tests/platform/showcaseEditorPage.test.tsx
// showcase editor auth-gating regressions

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShowcaseEditorPage } from '~/features/platform/showcase/pages/ShowcaseEditorPage'
import { makeSignedInSession } from '@tests/fixtures'

const mocks = vi.hoisted(() => ({
  showSignIn: vi.fn(),
  useAuthSession: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
  useSignInPromptStore: vi.fn(),
}))

vi.mock('convex/react', () => ({
  useMutation: mocks.useMutation,
  useQuery: mocks.useQuery,
}))

vi.mock('~/features/platform/auth/model/useAuthSession', () => ({
  useAuthSession: mocks.useAuthSession,
}))

vi.mock('~/features/platform/auth/model/useSignInPromptStore', () => ({
  useSignInPromptStore: mocks.useSignInPromptStore,
}))

vi.mock('~/shared/hooks/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}))

const signedInSession = () =>
  makeSignedInSession({
    email: 'owner@example.test',
    name: 'Owner',
    handle: 'owner',
  })

const renderEditor = (): string =>
  renderToStaticMarkup(
    <MemoryRouter>
      <ShowcaseEditorPage />
    </MemoryRouter>
  )

describe('ShowcaseEditorPage auth gate', () =>
{
  beforeEach(() =>
  {
    mocks.useMutation.mockReturnValue(vi.fn())
    mocks.useQuery.mockReturnValue(undefined)
    mocks.useSignInPromptStore.mockImplementation((selector) =>
      selector({ show: mocks.showSignIn })
    )
  })

  it('does not mount the edit query and replaces the editor while signed out', () =>
  {
    mocks.useAuthSession.mockReturnValue({ status: 'signed-out' })

    const html = renderEditor()

    expect(mocks.useQuery).not.toHaveBeenCalled()
    expect(mocks.useMutation).not.toHaveBeenCalled()
    expect(html).toContain(
      'Sign in to build and save the tier list shown on your profile.'
    )
    expect(html).not.toContain('Changes save automatically.')
  })

  it('subscribes to the edit query only after a signed-in user is known', () =>
  {
    mocks.useAuthSession.mockReturnValue(signedInSession())

    renderEditor()

    expect(mocks.useQuery.mock.calls[0]?.[1]).toEqual({})
  })
})
