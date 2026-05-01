// e2e/image-editor.spec.ts
// Playwright guardrails for image-editor autosave & persisted transforms

import { expect, test, type Page } from 'playwright/test'
import {
  openWorkspaceWithBoard,
  readActiveBoardFromBrowser,
  resetBrowserStorage,
} from './helpers'

type StoredTransform = Record<string, unknown> | null

const readStoredImageTransform = async (
  page: Page
): Promise<StoredTransform> =>
{
  const envelope = await readActiveBoardFromBrowser(page)
  if (!envelope?.boardRaw) return null

  const parsed = JSON.parse(envelope.boardRaw) as {
    data?: { items?: Record<string, unknown> }
  }
  const items = parsed.data?.items
  if (!items) return null

  for (const value of Object.values(items))
  {
    if (!value || typeof value !== 'object') continue
    const item = value as Record<string, unknown>
    if (!item.imageRef && !item.sourceImageRef) continue
    const transform = item.transform
    return transform && typeof transform === 'object'
      ? (transform as Record<string, unknown>)
      : null
  }

  return null
}

test.beforeEach(async ({ page }) =>
{
  await resetBrowserStorage(page)
})

test('image editor transform autosaves and survives reload', async ({
  page,
}) =>
{
  await page.route('**/e2e-editor-persist-wide.svg', async (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#5a5a5a"/></svg>',
    })
  )

  await openWorkspaceWithBoard(page)
  await page.getByRole('button', { name: 'Open settings' }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await expect(settings).toBeVisible()

  await page.getByRole('tab', { name: /layout/i }).click()
  await settings.getByRole('button', { name: '1:1', exact: true }).click()
  await page.getByRole('tab', { name: /items/i }).click()

  const imageUrl = new URL(
    '/e2e-editor-persist-wide.svg',
    page.url()
  ).toString()
  await settings.getByLabel('Image URL').fill(imageUrl)
  await settings.getByRole('button', { name: 'Add' }).first().click()

  const prompt = page.getByRole('dialog', {
    name: 'Mixed aspect ratios detected',
  })
  await expect(prompt).toBeVisible()
  await prompt.getByRole('button', { name: /adjust each item/i }).click()

  const editor = page.getByRole('dialog', {
    name: 'Adjust items to fit board',
  })
  await expect(editor).toBeVisible()
  await editor.getByRole('button', { name: 'Image', exact: true }).click()
  await editor.getByRole('button', { name: 'Rotate right 90 degrees' }).click()
  await expect(editor.getByText('Editing...')).toBeVisible()

  await expect
    .poll(() => readStoredImageTransform(page), { timeout: 7_000 })
    .toMatchObject({ rotation: 90 })

  await editor.getByRole('button', { name: 'Close' }).click()
  await page.reload()
  await expect(page.getByTestId('tier-list-board')).toBeVisible()
  await expect(readStoredImageTransform(page)).resolves.toMatchObject({
    rotation: 90,
  })

  await page.getByRole('button', { name: 'Open settings' }).click()
  await page.getByRole('tab', { name: /layout/i }).click()
  await page.getByRole('button', { name: 'Edit images...' }).click()

  const reopenedEditor = page.getByRole('dialog', {
    name: 'Adjust items to fit board',
  })
  await expect(reopenedEditor).toBeVisible()
  await reopenedEditor.getByRole('tab', { name: 'Adjusted' }).click()
  await expect(reopenedEditor).toContainText('Item 1 of 1')
})
