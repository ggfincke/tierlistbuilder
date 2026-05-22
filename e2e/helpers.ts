// e2e/helpers.ts
// shared Playwright helpers for workspace, auth, & catalog guardrails

import { expect, type Locator, type Page } from 'playwright/test'
import { deflate } from 'pako'
import {
  BOARD_REGISTRY_STORAGE_KEY,
  boardStorageKey,
  boardSyncStorageKey,
} from '../src/features/workspace/boards/data/local/storageKeys'

type E2eBoard = {
  title: string
  tiers: {
    id: string
    name: string
    colorSpec: { kind: 'palette'; index: number }
    itemIds: string[]
  }[]
  unrankedItemIds: string[]
  items: Record<string, { id: string; label: string; backgroundColor: string }>
  deletedItems: []
}

export const multiSelectModifier: 'Meta' | 'Control' =
  process.platform === 'darwin' ? 'Meta' : 'Control'

export const tierItemTestId = (itemId: string): string => `tier-item-${itemId}`
export const tierContainerTestId = (tierId: string): string =>
  `tier-container-${tierId}`
export const templateSearchBox = (page: Page): Locator =>
  page.getByRole('searchbox', { name: 'Search templates' })
export const templateSortSelect = (page: Page): Locator =>
  page.getByRole('combobox', { name: /sort templates by/i })
export const templateCategoryChip = (page: Page, label: string): Locator =>
  page.getByRole('button', { name: new RegExp(`^${label}`) })

export const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const makeRunId = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const addImageViaSettings = async (
  page: Page,
  imageUrl: string
): Promise<Locator> =>
{
  await page.getByRole('button', { name: 'Open settings' }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await expect(settings).toBeVisible()

  await page.getByRole('tab', { name: /layout/i }).click()
  await settings.getByRole('button', { name: '1:1', exact: true }).click()
  await page.getByRole('tab', { name: /items/i }).click()

  await settings.getByLabel('Image URL').fill(imageUrl)
  await settings.getByRole('button', { name: 'Add' }).first().click()

  return page.getByRole('dialog', {
    name: 'Mixed aspect ratios detected',
  })
}

// keep the encoding contract aligned w/ src/shared/sharing/hashShare.ts —
// prod uses a lazy-loaded pako via the browser-only binaryCodec; the e2e side
// runs in Node so we stand up a minimal Buffer-based base64url encoder
const toBase64Url = (bytes: Uint8Array): string =>
  Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

export const encodeShareFragment = (board: E2eBoard): string =>
  toBase64Url(deflate(new TextEncoder().encode(JSON.stringify(board))))

export const makeBoard = (title: string): E2eBoard => ({
  title,
  tiers: [
    {
      id: 'tier-s',
      name: 'S',
      colorSpec: { kind: 'palette', index: 0 },
      itemIds: ['item-alpha'],
    },
    {
      id: 'tier-a',
      name: 'A',
      colorSpec: { kind: 'palette', index: 1 },
      itemIds: ['item-beta'],
    },
  ],
  unrankedItemIds: ['item-gamma', 'item-delta'],
  items: {
    'item-alpha': {
      id: 'item-alpha',
      label: 'Alpha',
      backgroundColor: '#111111',
    },
    'item-beta': {
      id: 'item-beta',
      label: 'Beta',
      backgroundColor: '#222222',
    },
    'item-gamma': {
      id: 'item-gamma',
      label: 'Gamma',
      backgroundColor: '#333333',
    },
    'item-delta': {
      id: 'item-delta',
      label: 'Delta',
      backgroundColor: '#444444',
    },
  },
  deletedItems: [],
})

export const resetBrowserStorage = async (page: Page): Promise<void> =>
{
  await page.addInitScript(() =>
  {
    if (window.sessionStorage.getItem('__tlb_e2e_storage_reset') === 'done')
    {
      return
    }

    window.localStorage.clear()
    window.sessionStorage.clear()
    window.sessionStorage.setItem('__tlb_e2e_storage_reset', 'done')
  })
}

export const openWorkspaceWithBoard = async (
  page: Page,
  board = makeBoard('Phase 1 Guardrail Board')
): Promise<E2eBoard> =>
{
  await page.goto(`/#share=${encodeShareFragment(board)}`)
  await expect(page.getByTestId('tier-list-board')).toBeVisible()
  await expect(
    page.getByRole('button', { name: /edit board title/i })
  ).toHaveText(board.title)
  return board
}

export const dragCenterToCenter = async (
  page: Page,
  source: Locator,
  target: Locator
): Promise<void> =>
{
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()

  if (!sourceBox || !targetBox)
  {
    throw new Error('unable to resolve drag boxes')
  }

  const sourceX = sourceBox.x + sourceBox.width / 2
  const sourceY = sourceBox.y + sourceBox.height / 2
  const targetX = targetBox.x + targetBox.width / 2
  const targetY = targetBox.y + targetBox.height / 2

  await page.mouse.move(sourceX, sourceY)
  await page.mouse.down()
  await page.mouse.move(sourceX + 12, sourceY + 12)
  await page.mouse.move(targetX, targetY, { steps: 12 })
  await page.mouse.up()
}

export const signUpNewAccount = async (
  page: Page,
  email: string,
  password = 'group-b-password'
): Promise<void> =>
{
  await page.getByLabel('Open account menu').click()
  await page.getByRole('menuitem', { name: 'Sign in' }).click()

  const signIn = page.getByRole('dialog', { name: 'Sign in' })
  await expect(signIn).toBeVisible()
  await signIn.getByRole('tab', { name: 'Create account' }).click()

  const signUp = page.getByRole('dialog', { name: 'Create account' })
  await expect(signUp).toBeVisible()
  await signUp.getByLabel('Email').fill(email)
  await signUp.getByLabel('Password').fill(password)
  await signUp.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByLabel(/Account:/)).toBeVisible({ timeout: 15_000 })
}

// pull the active board's localStorage envelope out of the page so spec-side
// code can inspect it. returns null when no registry/active-board is set.
// callers parse boardRaw/syncRaw w/ the matching JSON shape they expect
interface ActiveBoardStorageEnvelope
{
  activeBoardId: string
  boardRaw: string | null
  syncRaw: string | null
}

export const readActiveBoardFromBrowser = async (
  page: Page
): Promise<ActiveBoardStorageEnvelope | null> =>
  page.evaluate(
    ({ registryKey, boardKeyPrefix, syncKeyPrefix }) =>
    {
      const registryRaw = window.localStorage.getItem(registryKey)
      if (!registryRaw) return null
      try
      {
        const registry = JSON.parse(registryRaw) as {
          state?: { activeBoardId?: unknown }
        }
        const activeBoardId = registry.state?.activeBoardId
        if (typeof activeBoardId !== 'string') return null
        return {
          activeBoardId,
          boardRaw: window.localStorage.getItem(
            `${boardKeyPrefix}${activeBoardId}`
          ),
          syncRaw: window.localStorage.getItem(
            `${syncKeyPrefix}${activeBoardId}`
          ),
        }
      }
      catch
      {
        return null
      }
    },
    {
      registryKey: BOARD_REGISTRY_STORAGE_KEY,
      boardKeyPrefix: boardStorageKey(''),
      syncKeyPrefix: boardSyncStorageKey(''),
    }
  )

export const waitForActiveBoardCloudSync = async (
  page: Page,
  timeout = 30_000
): Promise<void> =>
{
  await expect
    .poll(
      async () =>
      {
        const envelope = await readActiveBoardFromBrowser(page)
        if (!envelope?.syncRaw) return false
        try
        {
          const syncState = JSON.parse(envelope.syncRaw)
          return (
            typeof syncState?.cloudBoardExternalId === 'string' &&
            syncState.pendingSyncAt === null
          )
        }
        catch
        {
          return false
        }
      },
      { timeout }
    )
    .toBe(true)
}
