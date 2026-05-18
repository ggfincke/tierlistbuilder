// e2e/marketplace-library.spec.ts
// signed-in marketplace publish/use-template & My Boards activation guardrails

import { expect, test } from 'playwright/test'

import {
  escapeRegExp,
  makeBoard,
  openWorkspaceWithBoard,
  resetBrowserStorage,
  signUpNewAccount,
  templateSearchBox,
  waitForActiveBoardCloudSync,
} from './helpers'

test.describe.configure({ timeout: 90_000 })

test.beforeEach(async ({ page }) =>
{
  await resetBrowserStorage(page)
})

test('signed-in publish, use-template, and My Boards open flow', async ({
  page,
}) =>
{
  const runId = `${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`
  const sourceTitle = `Group B Source ${runId}`
  const templateTitle = `Group B Template ${runId}`
  const escapedTemplateTitle = escapeRegExp(templateTitle)

  await openWorkspaceWithBoard(page, makeBoard(sourceTitle))
  await signUpNewAccount(page, `group-b-${runId}@example.com`)
  await waitForActiveBoardCloudSync(page)

  await page.goto('/templates')
  await expect(templateSearchBox(page)).toBeVisible()
  await page.getByRole('button', { name: 'Create new template' }).click()

  const publish = page.getByRole('dialog', { name: 'Publish as template' })
  await expect(publish).toBeVisible()
  await expect(publish.getByText(sourceTitle)).toBeVisible()
  await publish.getByLabel('Title').fill(templateTitle)
  await publish
    .getByLabel('Description')
    .fill('Group B signed-in marketplace workflow coverage.')
  await publish.getByLabel('Visibility').selectOption('unlisted')
  await publish.getByRole('button', { name: 'Publish template' }).click()

  await expect(page).toHaveURL(/\/templates\/[A-Za-z0-9-]+$/)
  await expect(
    page.getByRole('heading', { level: 1, name: templateTitle })
  ).toBeVisible()

  await page.getByRole('button', { name: 'Use this template' }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(
    page.getByRole('button', { name: /edit board title/i })
  ).toHaveText(templateTitle)
  await expect(page.getByText('Alpha')).toBeVisible()

  await page.getByRole('button', { name: 'Board manager' }).click()
  await page.getByRole('button', { name: 'New List' }).click()
  const newList = page.getByRole('dialog', { name: 'New List' })
  await expect(newList).toBeVisible()
  await newList.getByRole('button', { name: 'Blank Board' }).click()
  await expect(
    page.getByRole('button', { name: /edit board title/i })
  ).toHaveText(/^My Tier List/)

  await page.goto('/boards')
  await expect(page.getByRole('heading', { name: 'My boards' })).toBeVisible()
  await page
    .getByRole('searchbox', { name: 'Search your boards' })
    .fill(templateTitle)

  const templateBoardCard = page
    .getByRole('button', {
      name: new RegExp(`^${escapedTemplateTitle}`),
    })
    .first()
  await expect(templateBoardCard).toBeVisible()
  await templateBoardCard.click()

  await expect(page).toHaveURL(/\/$/)
  await expect(
    page.getByRole('button', { name: /edit board title/i })
  ).toHaveText(templateTitle)
})
