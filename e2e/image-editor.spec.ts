// e2e/image-editor.spec.ts
// Playwright guardrails for image-editor autosave & persisted transforms

import { expect, test, type Page } from 'playwright/test'
import {
  addImageViaSettings,
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

const readStoredImageTransformJson = async (page: Page): Promise<string> =>
  JSON.stringify(await readStoredImageTransform(page))

const waitForStoredImageTransformJson = async (page: Page): Promise<string> =>
{
  await expect
    .poll(() => readStoredImageTransformJson(page), { timeout: 7_000 })
    .not.toBe('null')
  return await readStoredImageTransformJson(page)
}

const useCaptionBelowLabelDefaults = async (page: Page): Promise<void> =>
{
  await page.addInitScript(() =>
  {
    window.localStorage.setItem(
      'tier-list-builder-preferences',
      JSON.stringify({
        state: {
          defaultLabelPlacementMode: 'captionBelow',
          showLabels: false,
        },
        version: 5,
      })
    )
  })
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
  const imageUrl = new URL(
    '/e2e-editor-persist-wide.svg',
    page.url()
  ).toString()
  const prompt = await addImageViaSettings(page, imageUrl)
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

test('ratio prompt auto-crops imported image without opening editor', async ({
  page,
}) =>
{
  await page.route('**/e2e-prompt-autocrop-wide.svg', async (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect x="40" y="10" width="160" height="90" fill="#69d6c5"/></svg>',
    })
  )
  await useCaptionBelowLabelDefaults(page)

  await openWorkspaceWithBoard(page)
  const imageUrl = new URL(
    '/e2e-prompt-autocrop-wide.svg',
    page.url()
  ).toString()
  const prompt = await addImageViaSettings(page, imageUrl)
  await expect(prompt).toBeVisible()
  const done = prompt.getByRole('button', { name: 'Done' })

  const labelsToggle = prompt.getByRole('switch', {
    name: 'Show labels by default',
  })
  await labelsToggle.click()
  await expect(done).toBeEnabled({ timeout: 12_000 })
  const labelsOnTransform = await waitForStoredImageTransformJson(page)

  await labelsToggle.click()
  await expect(done).toBeEnabled({ timeout: 12_000 })
  await expect
    .poll(() => readStoredImageTransformJson(page), { timeout: 7_000 })
    .not.toBe(labelsOnTransform)

  await done.click()
  await expect(prompt).toBeHidden()

  await expect
    .poll(async () => Boolean(await readStoredImageTransform(page)), {
      timeout: 7_000,
    })
    .toBe(true)
})

test('image editor reruns auto-crop when label visibility changes', async ({
  page,
}) =>
{
  await page.route('**/e2e-editor-label-rerun-wide.svg', async (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect x="40" y="10" width="160" height="90" fill="#69d6c5"/></svg>',
    })
  )
  await useCaptionBelowLabelDefaults(page)

  await openWorkspaceWithBoard(page)
  const imageUrl = new URL(
    '/e2e-editor-label-rerun-wide.svg',
    page.url()
  ).toString()
  const prompt = await addImageViaSettings(page, imageUrl)
  await expect(prompt).toBeVisible()
  await prompt.getByRole('button', { name: /adjust each item/i }).click()

  const editor = page.getByRole('dialog', {
    name: 'Adjust items to fit board',
  })
  await expect(editor).toBeVisible()

  const labelsToggle = editor.getByRole('switch', {
    name: 'Show labels by default',
  })
  await expect(labelsToggle).not.toBeChecked()
  await expect(
    editor.getByRole('button', { name: 'Auto-crop applied to all images' })
  ).toBeVisible({ timeout: 12_000 })
  const labelsOffTransform = await waitForStoredImageTransformJson(page)

  await labelsToggle.click()
  await expect
    .poll(() => readStoredImageTransformJson(page), { timeout: 7_000 })
    .not.toBe(labelsOffTransform)
  await expect(
    editor.getByRole('button', { name: 'Auto-crop applied to all images' })
  ).toBeVisible({ timeout: 12_000 })
  const labelsOnTransform = await waitForStoredImageTransformJson(page)

  await labelsToggle.click()
  await expect
    .poll(() => readStoredImageTransformJson(page), { timeout: 7_000 })
    .not.toBe(labelsOnTransform)
  await expect(
    editor.getByRole('button', { name: 'Auto-crop applied to all images' })
  ).toBeVisible({ timeout: 12_000 })
})
