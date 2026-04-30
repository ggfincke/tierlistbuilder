// e2e/guardrails.spec.ts
// Playwright guardrails for cross-layer board workflows

import { expect, test, type Locator, type Page } from 'playwright/test'
import { deflate } from 'pako'

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

const multiSelectModifier: 'Meta' | 'Control' =
  process.platform === 'darwin' ? 'Meta' : 'Control'

const tierItemTestId = (itemId: string): string => `tier-item-${itemId}`
const tierContainerTestId = (tierId: string): string =>
  `tier-container-${tierId}`
const templateSearchBox = (page: Page): Locator =>
  page.getByRole('searchbox', { name: 'Search templates' })
const templateSortSelect = (page: Page): Locator =>
  page.getByRole('combobox', { name: /sort templates by/i })
const templateCategoryChip = (page: Page, label: string): Locator =>
  page.getByRole('button', { name: new RegExp(`^${label}`) })

const toBase64Url = (bytes: Uint8Array): string =>
  Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const encodeShareFragment = (board: E2eBoard): string =>
  toBase64Url(deflate(new TextEncoder().encode(JSON.stringify(board))))

const makeBoard = (title: string): E2eBoard => ({
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

const resetBrowserStorage = async (page: Page): Promise<void> =>
{
  await page.addInitScript(() =>
  {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
}

const openWorkspaceWithBoard = async (
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

const dragCenterToCenter = async (
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

test.beforeEach(async ({ page }) =>
{
  await resetBrowserStorage(page)
})

test('keyboard drag moves an item across tiers & restores focus', async ({
  page,
}) =>
{
  await openWorkspaceWithBoard(page)

  const alpha = page.getByTestId(tierItemTestId('item-alpha'))
  await alpha.focus()
  await expect(alpha).toBeFocused()

  await page.keyboard.press('Space')
  await expect(alpha).toHaveAttribute('data-keyboard-dragging', 'true')

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')

  const destination = page.getByTestId(tierContainerTestId('tier-a'))
  await expect(
    destination.getByTestId(tierItemTestId('item-alpha'))
  ).toBeVisible()
  await expect(alpha).toBeFocused()
})

test('pointer drag moves an item across tiers & undo restores it', async ({
  page,
}) =>
{
  await openWorkspaceWithBoard(page)

  const alpha = page.getByTestId(tierItemTestId('item-alpha'))
  const tierS = page.getByTestId(tierContainerTestId('tier-s'))
  const tierA = page.getByTestId(tierContainerTestId('tier-a'))
  const beta = page.getByTestId(tierItemTestId('item-beta'))

  await dragCenterToCenter(page, alpha, beta)

  await expect(tierA.getByTestId(tierItemTestId('item-alpha'))).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled()
  await page.keyboard.press(`${multiSelectModifier}+Z`)
  await expect(tierS.getByTestId(tierItemTestId('item-alpha'))).toBeVisible()
})

test('bulk item delete is restored by one undo', async ({ page }) =>
{
  await openWorkspaceWithBoard(page)

  const gamma = page.getByTestId(tierItemTestId('item-gamma'))
  const delta = page.getByTestId(tierItemTestId('item-delta'))
  await gamma.click()
  await delta.click({ modifiers: [multiSelectModifier] })

  await expect(gamma).toHaveAttribute('data-selected', 'true')
  await expect(delta).toHaveAttribute('data-selected', 'true')

  await page.keyboard.press('Delete')
  await expect(page.getByTestId(tierItemTestId('item-gamma'))).toHaveCount(0)
  await expect(page.getByTestId(tierItemTestId('item-delta'))).toHaveCount(0)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByTestId(tierItemTestId('item-gamma'))).toBeVisible()
  await expect(page.getByTestId(tierItemTestId('item-delta'))).toBeVisible()
})

test('nested modal Escape closes only the topmost dialog', async ({ page }) =>
{
  await page.goto('/')
  await expect(page.getByTestId('tier-list-board')).toBeVisible()

  await page.getByRole('button', { name: 'Open settings' }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await expect(settings).toBeVisible()

  await page.getByRole('tab', { name: /more/i }).click()
  await page.getByRole('button', { name: 'Clear All Items' }).click()
  const confirm = page.getByRole('alertdialog', {
    name: 'Clear all items?',
  })
  await expect(confirm).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(confirm).toBeHidden()
  await expect(settings).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(settings).toBeHidden()
})

test('mixed aspect-ratio prompt fits a mobile settings viewport', async ({
  page,
}) =>
{
  await page.setViewportSize({ width: 360, height: 720 })
  await page.route('**/e2e-wide.svg', async (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#444"/></svg>',
    })
  )

  await openWorkspaceWithBoard(page)
  await page.getByRole('button', { name: 'Open settings' }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await expect(settings).toBeVisible()

  await page.getByRole('tab', { name: /layout/i }).click()
  await settings.getByRole('button', { name: '1:1', exact: true }).click()
  await page.getByRole('tab', { name: /items/i }).click()

  const imageUrl = new URL('/e2e-wide.svg', page.url()).toString()
  await settings.getByLabel('Image URL').fill(imageUrl)
  await settings.getByRole('button', { name: 'Add' }).first().click()

  const prompt = page.getByRole('dialog', {
    name: 'Mixed aspect ratios detected',
  })
  await expect(prompt).toBeVisible()
  await expect(prompt).toContainText('1 item')

  const promptOverflows = await prompt.evaluate(
    (node) => node.scrollWidth > node.clientWidth + 1
  )
  expect(promptOverflows).toBe(false)

  const tileRows = await prompt
    .locator('button[aria-pressed]')
    .evaluateAll(
      (buttons) =>
        new Set(
          buttons.map((button) =>
            Math.round(button.getBoundingClientRect().top)
          )
        ).size
    )
  expect(tileRows).toBeGreaterThan(1)

  const pageOverflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  )
  expect(pageOverflows).toBe(false)
})

test('mixed aspect-ratio prompt opens the image editor', async ({ page }) =>
{
  await page.route('**/e2e-editor-wide.svg', async (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#555"/></svg>',
    })
  )

  await openWorkspaceWithBoard(page)
  await page.getByRole('button', { name: 'Open settings' }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await expect(settings).toBeVisible()

  await page.getByRole('tab', { name: /layout/i }).click()
  await settings.getByRole('button', { name: '1:1', exact: true }).click()
  await page.getByRole('tab', { name: /items/i }).click()

  const imageUrl = new URL('/e2e-editor-wide.svg', page.url()).toString()
  await settings.getByLabel('Image URL').fill(imageUrl)
  await settings.getByRole('button', { name: 'Add' }).first().click()

  const prompt = page.getByRole('dialog', {
    name: 'Mixed aspect ratios detected',
  })
  await expect(prompt).toBeVisible()
  await prompt.getByRole('button', { name: /adjust each item/i }).click()
  await expect(prompt).toBeHidden()

  const editor = page.getByRole('dialog', {
    name: 'Adjust items to fit board',
  })
  await expect(editor).toBeVisible()
  await expect(editor.getByRole('tab', { name: 'Mismatched' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(editor).toContainText('Item 1 of 1')
})

test('embed route renders hash-share board without workspace controls', async ({
  page,
}) =>
{
  const board = makeBoard('Embeddable Phase 1 Board')
  await page.goto(`/embed#share=${encodeShareFragment(board)}`)

  await expect(
    page.getByRole('heading', { name: 'Embeddable Phase 1 Board' })
  ).toBeVisible()
  await expect(page.getByText('Alpha')).toBeVisible()
  await expect(page.getByText('Made with Tier List Builder')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add tier' })).toHaveCount(0)
})

test('marketplace filters follow query-param changes while mounted', async ({
  page,
}) =>
{
  await page.goto('/templates?q=zelda&cat=gaming&sort=popular')

  const search = templateSearchBox(page)
  const sort = templateSortSelect(page)
  await expect(search).toHaveValue('zelda')
  await expect(templateCategoryChip(page, 'Gaming')).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(sort).toHaveValue('popular')

  await page.evaluate(() =>
  {
    window.history.pushState(
      null,
      '',
      '/templates?q=ghibli&cat=anime&sort=featured&tag=Bosses'
    )
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
  })

  await expect(search).toHaveValue('ghibli')
  await expect(templateCategoryChip(page, 'Anime & Manga')).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(
    page.getByRole('button', { name: 'Remove tag filter "bosses"' })
  ).toBeVisible()
  await expect(sort).toHaveValue('recent')
  await expect(sort).toBeDisabled()
  await expect(page).toHaveURL(/tag=bosses/)
})

test('marketplace discrete filters create navigable history entries', async ({
  page,
}) =>
{
  await page.goto('/templates')

  const all = templateCategoryChip(page, 'All')
  const gaming = templateCategoryChip(page, 'Gaming')
  const sort = templateSortSelect(page)

  await gaming.click()
  await expect(page).toHaveURL(/cat=gaming/)
  await expect(gaming).toHaveAttribute('aria-pressed', 'true')

  await sort.selectOption('popular')
  await expect(page).toHaveURL(/sort=popular/)
  await expect(sort).toHaveValue('popular')

  await page.goBack()
  await expect(page).not.toHaveURL(/sort=popular/)
  await expect(gaming).toHaveAttribute('aria-pressed', 'true')
  await expect(sort).toHaveValue('recent')

  await page.goBack()
  await expect(page).not.toHaveURL(/cat=gaming/)
  await expect(all).toHaveAttribute('aria-pressed', 'true')

  await page.goForward()
  await expect(gaming).toHaveAttribute('aria-pressed', 'true')

  await page.goForward()
  await expect(sort).toHaveValue('popular')
})
