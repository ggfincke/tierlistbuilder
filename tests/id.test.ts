import { describe, expect, it } from 'vitest'

import {
  generateBoardId,
  generatePresetId,
  generateTierId,
  isBoardId,
  isPresetId,
  isTierId,
} from '@/shared/lib/id'

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
    expect(isBoardId('board-123')).toBe(true)
    expect(isTierId('tier-123')).toBe(true)
    expect(isPresetId('preset-123')).toBe(true)
    expect(isPresetId('builtin-classic')).toBe(true)
  })

  it('rejects mismatched prefixes', () =>
  {
    expect(isBoardId('tier-123')).toBe(false)
    expect(isTierId('custom-tier')).toBe(false)
    expect(isPresetId('custom-preset')).toBe(false)
  })
})
