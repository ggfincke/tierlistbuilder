// e2e/smoke.spec.ts
// boots the app, asserts the tier list board renders, & confirms
// core action buttons (Add Tier, Export) are present & responsive

import { expect, test } from 'playwright/test'

test('app boots & core workspace UI renders', async ({ page }) =>
{
  await page.goto('/')

  const board = page.getByTestId('tier-list-board')
  await expect(board).toBeVisible()

  const unranked = page.getByTestId('unranked-container')
  await expect(unranked).toBeVisible()

  const addTier = page.getByRole('button', { name: 'Add tier' })
  await expect(addTier).toBeVisible()

  const countBefore = await page
    .locator('[data-testid^="tier-container-"]')
    .count()
  await addTier.click()
  await expect(page.locator('[data-testid^="tier-container-"]')).toHaveCount(
    countBefore + 1
  )

  const exportButton = page.getByRole('button', { name: /export/i })
  await expect(exportButton.first()).toBeVisible()
})

test('library route supports deep links, refresh, and browser history', async ({
  page,
}) =>
{
  await page.goto('/boards')

  await expect(page).toHaveURL(/\/boards$/)
  await expect(page.getByRole('heading', { name: 'My boards' })).toBeVisible()
  await expect(page.getByLabel('Primary navigation')).toBeVisible()

  await page.reload()
  await expect(page).toHaveURL(/\/boards$/)
  await expect(page.getByRole('heading', { name: 'My boards' })).toBeVisible()

  await page.getByRole('link', { name: 'Workspace' }).click()
  await expect(page.getByTestId('tier-list-board')).toBeVisible()
  await expect(page).toHaveURL(/\/$/)

  await page.goBack()
  await expect(page).toHaveURL(/\/boards$/)
  await expect(page.getByRole('heading', { name: 'My boards' })).toBeVisible()
})
