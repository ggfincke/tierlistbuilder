import { describe, expect, it } from 'vitest'

import {
  generateBoardId,
  generatePresetId,
  generateTierId,
  isTierId,
} from '@tierlistbuilder/contracts/lib/ids'

describe('ID helpers', () =>
{
  it('generates board, tier, & preset IDs with the expected prefixes', () =>
  {
    expect(generateBoardId()).toMatch(/^board-/)
    expect(generateTierId()).toMatch(/^tier-/)
    expect(generatePresetId()).toMatch(/^preset-/)
  })

  it('recognizes valid generated ID prefixes', () =>
  {
    expect(isTierId('tier-123')).toBe(true)
  })

  it('rejects mismatched prefixes', () =>
  {
    expect(isTierId('custom-tier')).toBe(false)
  })
})
