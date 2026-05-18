// tests/model/localBoardsLibrary.test.ts
// local My Boards projection should expose forked-board cover thumbnails.

import { describe, expect, it } from 'vitest'

import type {
  BoardId,
  ItemId,
  TierId,
} from '@tierlistbuilder/contracts/lib/ids'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { saveBoardToStorage } from '~/features/workspace/boards/data/local/boardStorage'
import {
  projectLocalRow,
  projectLocalRows,
} from '~/features/library/model/useLocalBoardsLibrary'

const boardId = 'board-local-library' as BoardId
const tierId = 'tier-s' as TierId
const marioId = 'item-mario' as ItemId
const linkId = 'item-link' as ItemId

const snapshot: BoardSnapshot = {
  title: 'Local Smash Fork',
  tiers: [
    {
      id: tierId,
      name: 'S',
      colorSpec: { kind: 'palette', index: 0 },
      itemIds: [],
    },
  ],
  items: {
    [marioId]: {
      id: marioId,
      label: 'Mario',
      imageRef: {
        hash: 'preview-mario',
        cloudMediaExternalId: 'media-mario',
      },
      tileImageRef: {
        hash: 'tile-mario',
        cloudMediaExternalId: 'media-mario',
      },
    },
    [linkId]: {
      id: linkId,
      label: 'Link',
    },
  },
  unrankedItemIds: [marioId, linkId],
  deletedItems: [],
  sourceTemplateCoverMedia: {
    externalId: 'ssbu-cover',
    contentHash: 'hash-ssbu-cover',
    url: 'https://cdn.test/ssbu-cover.jpg',
    width: 1920,
    height: 1080,
    mimeType: 'image/jpeg',
  },
  sourceTemplateCoverFraming: {
    browseHero: null,
    detailHero: null,
    card: { x: 0.1, y: 0.2, width: 0.8, height: 0.5 },
  },
}

describe('useLocalBoardsLibrary projection', () =>
{
  it('projects local fork cover items with lazy image refs', () =>
  {
    const saved = saveBoardToStorage(boardId, snapshot)
    expect(saved.ok).toBe(true)

    const row = projectLocalRow({
      id: boardId,
      title: 'Local Smash Fork',
      createdAt: 123,
    })

    expect(row).toMatchObject({
      activeItemCount: 2,
      rankedItemCount: 0,
      publishState: 'draft',
      sourceTemplateCoverMedia: {
        externalId: 'ssbu-cover',
        contentHash: 'hash-ssbu-cover',
      },
      sourceTemplateCoverFraming: {
        card: { x: 0.1, y: 0.2, width: 0.8, height: 0.5 },
      },
    })
    expect(row.coverItems).toEqual([
      {
        externalId: marioId,
        label: 'Mario',
        mediaUrl: null,
        mediaHash: 'preview-mario',
        mediaCloudExternalId: 'media-mario',
        mediaVariant: 'preview',
      },
      {
        externalId: linkId,
        label: 'Link',
        mediaUrl: null,
      },
    ])
  })

  it('re-reads storage when stable registry meta points at an edited board', () =>
  {
    const meta = {
      id: boardId,
      title: 'Local Smash Fork',
      createdAt: 123,
    }
    expect(saveBoardToStorage(boardId, snapshot).ok).toBe(true)
    expect(projectLocalRows([meta])[0]).toMatchObject({
      rankedItemCount: 0,
      unrankedItemCount: 2,
    })

    const editedSnapshot: BoardSnapshot = {
      ...snapshot,
      tiers: [{ ...snapshot.tiers[0], itemIds: [marioId] }],
      unrankedItemIds: [linkId],
    }
    expect(saveBoardToStorage(boardId, editedSnapshot).ok).toBe(true)

    expect(projectLocalRows([meta])[0]).toMatchObject({
      rankedItemCount: 1,
      unrankedItemCount: 1,
    })
  })
})
