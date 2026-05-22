// e2e/account.spec.ts
// Playwright guardrails for account profile edits & deletion confirmation

import { expect, test } from 'playwright/test'

import {
  makeRunId,
  openWorkspaceWithBoard,
  resetBrowserStorage,
  signUpNewAccount,
} from './helpers'

test.describe.configure({ timeout: 90_000 })

test.beforeEach(async ({ page }) =>
{
  await resetBrowserStorage(page)
})

test('account profile saves and deletion requires confirmation', async ({
  page,
}) =>
{
  const runId = makeRunId()
  const email = `group-e-account-${runId}@example.com`
  const password = 'group-e-password'
  const displayName = `Group E ${runId}`
  const handle = `groupe${runId}`

  await openWorkspaceWithBoard(page)
  await signUpNewAccount(page, email, password)

  await page.getByLabel(/Account:/).click()
  await page.getByRole('menuitem', { name: 'Account' }).click()

  const account = page.getByRole('dialog', { name: 'Account' })
  await expect(account).toBeVisible()
  await account.getByLabel('Handle').fill(handle)
  await account.getByLabel('Display name').fill(displayName)
  await account
    .getByLabel('Bio')
    .fill('Group E browser coverage for account profile edits.')
  await account.getByLabel('Location').fill('Test lab')
  await account.getByLabel('Pronouns').selectOption('they/them')
  await account.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByText('Profile updated')).toBeVisible({
    timeout: 15_000,
  })
  await account.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByLabel(`Account: ${displayName}`)).toBeVisible({
    timeout: 15_000,
  })

  await page.getByLabel(`Account: ${displayName}`).click()
  await page.getByRole('menuitem', { name: 'Account' }).click()

  const reopenedAccount = page.getByRole('dialog', { name: 'Account' })
  await expect(reopenedAccount).toBeVisible()
  await expect(reopenedAccount.getByLabel('Handle')).toHaveValue(handle)
  await expect(reopenedAccount.getByLabel('Display name')).toHaveValue(
    displayName
  )
  await expect(reopenedAccount.getByLabel('Bio')).toHaveValue(
    'Group E browser coverage for account profile edits.'
  )
  await expect(reopenedAccount.getByLabel('Location')).toHaveValue('Test lab')
  await expect(reopenedAccount.getByLabel('Pronouns')).toHaveValue('they/them')

  await reopenedAccount.getByRole('button', { name: 'Delete account' }).click()
  const deleteForever = reopenedAccount.getByRole('button', {
    name: 'Delete forever',
  })
  await expect(deleteForever).toBeDisabled()
  await reopenedAccount.getByLabel("Type 'delete' to confirm").fill('nope')
  await expect(deleteForever).toBeDisabled()
  await reopenedAccount.getByLabel("Type 'delete' to confirm").fill('delete')
  await expect(deleteForever).toBeEnabled()
  await deleteForever.click()

  await expect(page.getByText('Account deleted')).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByLabel('Open account menu')).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
