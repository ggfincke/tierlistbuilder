// tests/utils/id.test.ts
// branded ID & short-link slug helpers

import { describe, expect, it } from 'vitest'

import {
  asBoardId,
  asPresetId,
  asTierId,
  generateBoardId,
  generatePresetId,
  generateShortLinkSlug,
  generateTierId,
  isShortLinkSlug,
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
    expect(isShortLinkSlug('aB30zY9Q')).toBe(true)
  })

  it('rejects mismatched prefixes', () =>
  {
    expect(isTierId('custom-tier')).toBe(false)
    expect(isShortLinkSlug('too-short')).toBe(false)
    expect(isShortLinkSlug('bad-slug!')).toBe(false)
  })

  it('casts trusted boundary strings through the shared helpers', () =>
  {
    expect(asBoardId('board-123')).toBe('board-123')
    expect(asTierId('tier-123')).toBe('tier-123')
    expect(asPresetId('preset-123')).toBe('preset-123')
  })

  it('generates short-link slugs in the canonical shape', () =>
  {
    expect(generateShortLinkSlug()).toMatch(/^[0-9A-Za-z]{8}$/)
  })
})
