// tests/shared-lib/id.test.ts
// branded ID prefix contract & short-link slug shape

import { describe, expect, it } from 'vitest'

import {
  generateBoardId,
  generatePresetId,
  generateShortLinkSlug,
  generateTierId,
  isShortLinkSlug,
} from '@tierlistbuilder/contracts/lib/ids'

describe('ID helpers', () =>
{
  it('generates IDs with the expected prefixes & slug shape', () =>
  {
    expect(generateBoardId()).toMatch(/^board-/)
    expect(generateTierId()).toMatch(/^tier-/)
    expect(generatePresetId()).toMatch(/^preset-/)
    expect(generateShortLinkSlug()).toMatch(/^[0-9A-Za-z]{8}$/)
    expect(isShortLinkSlug('aB30zY9Q')).toBe(true)
    expect(isShortLinkSlug('bad-slug!')).toBe(false)
  })
})
