// tests/shared-lib/id.test.ts
// branded ID prefix contract

import { describe, expect, it } from 'vitest'

import {
  generateBoardId,
  generatePresetId,
  generateTierId,
} from '@tierlistbuilder/contracts/lib/ids'

describe('ID helpers', () =>
{
  it('generates IDs with the expected prefixes', () =>
  {
    expect(generateBoardId()).toMatch(/^board-/)
    expect(generateTierId()).toMatch(/^tier-/)
    expect(generatePresetId()).toMatch(/^preset-/)
  })
})
