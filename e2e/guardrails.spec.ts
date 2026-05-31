// e2e/guardrails.spec.ts
// Playwright guardrails for cross-layer board workflows

import { expect, test } from 'playwright/test'
import {
  addImageViaSettings,
  dragCenterToCenter,
  encodeShareFragment,
  makeBoard,
  multiSelectModifier,
  openWorkspaceWithBoard,
  resetBrowserStorage,
  tierContainerTestId,
  tierItemTestId,
} from './helpers'

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

const makeTallDragBoard = () =>
{
  const board = makeBoard('Tall Drag Guardrail Board')
  board.tiers = Array.from({ length: 10 }, (_, tierIndex) => ({
    id: `tier-${tierIndex}`,
    name: `T${tierIndex}`,
    colorSpec: { kind: 'palette', index: tierIndex % 6 },
    itemIds: Array.from(
      { length: 6 },
      (_, itemIndex) => `item-${tierIndex * 6 + itemIndex}`
    ),
  }))
  board.unrankedItemIds = Array.from(
    { length: 20 },
    (_, index) => `item-${60 + index}`
  )
  board.items = Object.fromEntries(
    Array.from({ length: 80 }, (_, index) => [
      `item-${index}`,
      {
        id: `item-${index}`,
        label: `Item ${index}`,
        backgroundColor: '#333333',
      },
    ])
  )
  return board
}

test('pointer drag across a tall board does not trip DndContext measuring', async ({
  page,
}) =>
{
  const consoleErrors: string[] = []
  page.on('console', (message) =>
  {
    if (
      message.type() === 'error' &&
      message.text().includes('Maximum update depth exceeded')
    )
    {
      consoleErrors.push(message.text())
    }
  })

  await openWorkspaceWithBoard(page, makeTallDragBoard())

  const source = page.getByTestId(tierItemTestId('item-0'))
  const target = page.getByTestId('unranked-container')
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  if (!sourceBox || !targetBox)
  {
    throw new Error('unable to resolve tall board drag boxes')
  }

  const sourceX = sourceBox.x + sourceBox.width / 2
  const sourceY = sourceBox.y + sourceBox.height / 2
  const targetX = targetBox.x + targetBox.width / 2
  const targetY = targetBox.y + 20

  await page.mouse.move(sourceX, sourceY)
  await page.mouse.down()
  for (let step = 1; step <= 30; step++)
  {
    await page.mouse.move(
      sourceX + ((targetX - sourceX) * step) / 30,
      sourceY + ((targetY - sourceY) * step) / 30
    )
    await page.waitForTimeout(20)
  }
  await page.waitForTimeout(250)
  await page.mouse.up()

  await expect(target.getByTestId(tierItemTestId('item-0'))).toBeVisible()
  expect(consoleErrors).toEqual([])
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
  const imageUrl = new URL('/e2e-wide.svg', page.url()).toString()
  const prompt = await addImageViaSettings(page, imageUrl)
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
  const imageUrl = new URL('/e2e-editor-wide.svg', page.url()).toString()
  const prompt = await addImageViaSettings(page, imageUrl)
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

test('My Boards local-only banner has no remote CTAs', async ({ page }) =>
{
  await page.goto('/boards')

  await expect(page.getByRole('heading', { name: 'My boards' })).toBeVisible()
  await expect(
    page.getByText('These boards live on this device only.')
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add tier' })).toHaveCount(0)

  await expect(page.getByRole('button', { name: /sign in/i })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Templates' })).toHaveCount(0)
})
