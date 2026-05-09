// convex/marketplace/rankings/seed.ts
// dev-only seeding for sample community rankings on featured templates

import { ConvexError, v } from 'convex/values'
import {
  action,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from '../../_generated/server'
import { internal } from '../../_generated/api'
import type { Doc, Id } from '../../_generated/dataModel'
import {
  RANKING_FEATURED_BADGES,
  type RankingFeaturedBadge,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import { normalizeBoardTitle } from '@tierlistbuilder/contracts/workspace/board'
import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import { buildFreshBoardCloudFields } from '../../workspace/boards/cloudFields'
import {
  buildBoardLibrarySummary,
  EMPTY_BOARD_LIBRARY_SUMMARY,
  type BoardLibrarySummaryItem,
  type BoardLibrarySummaryTier,
} from '../../workspace/boards/librarySummary'
import { loadMediaVariantStorageId } from '../../lib/mediaVariants'
import { resolveTemplateProgressState } from '../../lib/templateProgress'
import {
  DEFAULT_TEMPLATE_TIERS,
  findTemplateCardByTemplateId,
  findTemplateStatsByTemplateId,
  isPublishedTemplateRow,
  loadTemplateItems,
} from '../templates/lib'
import {
  resolveActiveTemplateCriterion,
  resolveTemplateCriteria,
  toTemplateCriterionSnapshot,
} from '../templates/criteria'
import { queueTemplateRankingAggregateRecomputesForActiveCriteria } from './aggregate'
import {
  allocateRankingSlug,
  normalizeRankingDescription,
  normalizeRankingTitle,
  rankingTopScore,
} from './lib'

const SEED_SECRET_ENV = 'CONVEX_SEED_SECRET'
const SEED_EMAIL_DOMAIN = 'tierlistbuilder.local'
const DEFAULT_SAMPLE_USER_COUNT = 16
const SEED_WRITE_PAUSE_MS = 500
const MAX_TARGET_SEARCH_CARDS = 200
const MAX_SEED_ROW_ITEMS = 300
const MAX_SEED_ROW_TIERS = 64
const MAX_SEED_OWNER_RANKINGS = 120
const HOUR_MS = 60 * 60 * 1000

const targetKeyValidator = v.union(
  v.literal('ssbu'),
  v.literal('zelda'),
  v.literal('mcu')
)

type TargetKey = 'ssbu' | 'zelda' | 'mcu'

interface FeaturedSeedProfile
{
  profileIndex: number
  featuredRank: number
  featuredBadge: RankingFeaturedBadge
}

interface SeedTargetDefinition
{
  key: TargetKey
  title: string
  category: Doc<'templates'>['category']
  featuredRank: number
  rankingTitle: string
  boostTerms: readonly string[]
  dropTerms: readonly string[]
}

interface SeedProfile
{
  key: string
  displayName: string
  chaos: number
  contrarian: number
  boostTerms: Partial<Record<TargetKey, readonly string[]>>
  dropTerms?: Partial<Record<TargetKey, readonly string[]>>
}

interface CuratedTierGroup
{
  tierName: string
  labels: readonly string[]
}

interface CuratedOfficialRanking
{
  targetKey: TargetKey
  authorKey: string
  authorDisplayName: string
  rankingTitle: string
  rankingDescription: string
  featuredRank: number
  featuredBadge: RankingFeaturedBadge
  tiers: readonly TierPresetTier[]
  tierGroups: readonly CuratedTierGroup[]
  // child labels skipped because the source ranks the composite parent (e.g.
  // "Pokemon Trainer", not the splits). Parent is asserted present in
  // tierGroups so a rename surfaces immediately.
  parentLabelByLabel?: Readonly<Record<string, string>>
  // optional non-primary criterion lane this curated list belongs in. when
  // omitted the seed flow defaults to the template's active primary criterion
  // (preserves the original competitive-only behavior)
  criterionExternalId?: string
}

const SEED_TARGETS: readonly SeedTargetDefinition[] = [
  {
    key: 'ssbu',
    title: 'Super Smash Bros. Ultimate roster',
    category: 'gaming',
    featuredRank: 0,
    rankingTitle: 'Smash roster',
    boostTerms: [
      'mario',
      'link',
      'samus',
      'pikachu',
      'kirby',
      'fox',
      'joker',
      'sora',
      'sephiroth',
      'captain falcon',
      'donkey kong',
      'yoshi',
    ],
    dropTerms: ['mii', 'duck hunt', 'wii fit', 'dr. mario', 'pichu'],
  },
  {
    key: 'zelda',
    title: 'Legend of Zelda mainline',
    category: 'gaming',
    featuredRank: 1,
    rankingTitle: 'Zelda mainline',
    boostTerms: [
      'ocarina',
      'breath',
      'tears',
      'majora',
      'wind waker',
      'a link to the past',
      'twilight princess',
      'link awakening',
    ],
    dropTerms: ['tri force', 'four swords', 'phantom hourglass', 'zelda ii'],
  },
  {
    key: 'mcu',
    title: 'MCU films',
    category: 'movies',
    featuredRank: 2,
    rankingTitle: 'MCU films',
    boostTerms: [
      'iron man',
      'the avengers',
      'winter soldier',
      'civil war',
      'infinity war',
      'endgame',
      'guardians',
      'black panther',
      'ragnarok',
      'no way home',
    ],
    dropTerms: ['dark world', 'quantumania', 'eternals', 'incredible hulk'],
  },
]

const FEATURED_PROFILE_BADGES: readonly FeaturedSeedProfile[] = [
  {
    profileIndex: 0,
    featuredRank: 0,
    featuredBadge: RANKING_FEATURED_BADGES[0],
  },
  {
    profileIndex: 1,
    featuredRank: 1,
    featuredBadge: RANKING_FEATURED_BADGES[1],
  },
]

const SAMPLE_PROFILES: readonly SeedProfile[] = [
  {
    key: 'ava-byte',
    displayName: 'Ava Byte',
    chaos: 0.2,
    contrarian: 0.05,
    boostTerms: {
      ssbu: ['samus', 'zero suit', 'fox'],
      zelda: ['wind waker', 'link awakening'],
      mcu: ['guardians', 'spider'],
    },
  },
  {
    key: 'ben-combo',
    displayName: 'Ben Combo',
    chaos: 0.28,
    contrarian: 0.12,
    boostTerms: {
      ssbu: ['captain falcon', 'little mac', 'ryu', 'ken'],
      zelda: ['majora', 'twilight'],
      mcu: ['winter soldier', 'civil war'],
    },
  },
  {
    key: 'cora-quest',
    displayName: 'Cora Quest',
    chaos: 0.16,
    contrarian: 0,
    boostTerms: {
      ssbu: ['kirby', 'yoshi', 'pikachu'],
      zelda: ['ocarina', 'breath', 'tears'],
      mcu: ['endgame', 'infinity war', 'avengers'],
    },
  },
  {
    key: 'diego-frame',
    displayName: 'Diego Frame',
    chaos: 0.32,
    contrarian: 0.25,
    boostTerms: {
      ssbu: ['wario', 'snake', 'ness'],
      zelda: ['spirit tracks', 'phantom hourglass'],
      mcu: ['doctor strange', 'ant-man'],
    },
    dropTerms: { mcu: ['endgame'] },
  },
  {
    key: 'elise-circuit',
    displayName: 'Elise Circuit',
    chaos: 0.22,
    contrarian: 0.08,
    boostTerms: {
      ssbu: ['link', 'zelda', 'ganondorf'],
      zelda: ['a link to the past', 'link between worlds'],
      mcu: ['black panther', 'shang-chi'],
    },
  },
  {
    key: 'finn-nova',
    displayName: 'Finn Nova',
    chaos: 0.4,
    contrarian: 0.35,
    boostTerms: {
      ssbu: ['banjo', 'duck hunt', 'rob'],
      zelda: ['skyward sword', 'minish cap'],
      mcu: ['thor', 'ragnarok', 'dark world'],
    },
  },
  {
    key: 'gia-pilot',
    displayName: 'Gia Pilot',
    chaos: 0.18,
    contrarian: 0.04,
    boostTerms: {
      ssbu: ['falco', 'wolf', 'fox'],
      zelda: ['breath', 'tears'],
      mcu: ['captain marvel', 'black widow'],
    },
  },
  {
    key: 'hugo-bloom',
    displayName: 'Hugo Bloom',
    chaos: 0.3,
    contrarian: 0.18,
    boostTerms: {
      ssbu: ['peach', 'daisy', 'rosalina'],
      zelda: ['oracle', 'seasons', 'ages'],
      mcu: ['guardians', 'ant-man', 'wasp'],
    },
  },
  {
    key: 'iris-lane',
    displayName: 'Iris Lane',
    chaos: 0.24,
    contrarian: 0.1,
    boostTerms: {
      ssbu: ['marth', 'lucina', 'ike'],
      zelda: ['twilight princess', 'majora'],
      mcu: ['black panther', 'wakanda'],
    },
  },
  {
    key: 'jae-tempo',
    displayName: 'Jae Tempo',
    chaos: 0.35,
    contrarian: 0.22,
    boostTerms: {
      ssbu: ['sonic', 'mega man', 'pac-man'],
      zelda: ['zelda ii', 'adventure of link'],
      mcu: ['iron man 3', 'multiverse'],
    },
  },
  {
    key: 'kira-vale',
    displayName: 'Kira Vale',
    chaos: 0.19,
    contrarian: 0.03,
    boostTerms: {
      ssbu: ['sora', 'joker', 'sephiroth'],
      zelda: ['ocarina', 'a link to the past'],
      mcu: ['no way home', 'far from home'],
    },
  },
  {
    key: 'leo-sparks',
    displayName: 'Leo Sparks',
    chaos: 0.27,
    contrarian: 0.14,
    boostTerms: {
      ssbu: ['bowser', 'king k. rool', 'ridley'],
      zelda: ['link awakening', 'minish'],
      mcu: ['hulk', 'thor'],
    },
  },
  {
    key: 'mina-orbit',
    displayName: 'Mina Orbit',
    chaos: 0.31,
    contrarian: 0.2,
    boostTerms: {
      ssbu: ['villager', 'isabelle', 'steve'],
      zelda: ['skyward sword', 'wind waker'],
      mcu: ['eternals', 'captain america'],
    },
  },
  {
    key: 'nico-slate',
    displayName: 'Nico Slate',
    chaos: 0.21,
    contrarian: 0.07,
    boostTerms: {
      ssbu: ['cloud', 'sephiroth', 'hero'],
      zelda: ['tears', 'breath'],
      mcu: ['infinity war', 'endgame'],
    },
  },
  {
    key: 'olive-ray',
    displayName: 'Olive Ray',
    chaos: 0.37,
    contrarian: 0.28,
    boostTerms: {
      ssbu: ['jigglypuff', 'pichu', 'pokemon trainer'],
      zelda: ['four swords', 'tri force'],
      mcu: ['quantumania', 'captain marvel'],
    },
  },
  {
    key: 'pax-stone',
    displayName: 'Pax Stone',
    chaos: 0.23,
    contrarian: 0.09,
    boostTerms: {
      ssbu: ['donkey kong', 'diddy kong', 'yoshi'],
      zelda: ['twilight', 'majora'],
      mcu: ['ragnarok', 'guardians'],
    },
  },
]

// SSBU sub-fighters present in the template but absent from competitive lists.
// source rankings use composite parents, so children are skipped here.
const SSBU_CHILD_LABEL_PARENTS: Readonly<Record<string, string>> = {
  Squirtle: 'Pokemon Trainer',
  Ivysaur: 'Pokemon Trainer',
  Charizard: 'Pokemon Trainer',
  Pyra: 'Pyra And Mythra',
  Mythra: 'Pyra And Mythra',
}

const LUMIRANK_3RD_SSBU_TIERS: readonly TierPresetTier[] = [
  { name: 'S+', colorSpec: { kind: 'palette', index: 0 } },
  { name: 'S', colorSpec: { kind: 'palette', index: 0 } },
  { name: 'S-', colorSpec: { kind: 'palette', index: 0 } },
  { name: 'A+', colorSpec: { kind: 'palette', index: 1 } },
  { name: 'A', colorSpec: { kind: 'palette', index: 1 } },
  { name: 'A-', colorSpec: { kind: 'palette', index: 1 } },
  { name: 'B+', colorSpec: { kind: 'palette', index: 3 } },
  { name: 'B-', colorSpec: { kind: 'palette', index: 3 } },
  { name: 'C+', colorSpec: { kind: 'palette', index: 5 } },
  { name: 'C-', colorSpec: { kind: 'palette', index: 5 } },
  { name: 'D', colorSpec: { kind: 'palette', index: 7 } },
  { name: 'E', colorSpec: { kind: 'palette', index: 10 } },
]

const ULTRANK_4TH_SSBU_TIERS: readonly TierPresetTier[] = [
  { name: 'S+', colorSpec: { kind: 'palette', index: 0 } },
  { name: 'S-', colorSpec: { kind: 'palette', index: 0 } },
  { name: 'A+', colorSpec: { kind: 'palette', index: 1 } },
  { name: 'A', colorSpec: { kind: 'palette', index: 1 } },
  { name: 'A-', colorSpec: { kind: 'palette', index: 1 } },
  { name: 'B+', colorSpec: { kind: 'palette', index: 3 } },
  { name: 'B-', colorSpec: { kind: 'palette', index: 3 } },
  { name: 'C+', colorSpec: { kind: 'palette', index: 5 } },
  { name: 'C-', colorSpec: { kind: 'palette', index: 5 } },
  { name: 'D+', colorSpec: { kind: 'palette', index: 7 } },
  { name: 'D-', colorSpec: { kind: 'palette', index: 7 } },
  { name: 'E', colorSpec: { kind: 'palette', index: 10 } },
]

// official lists carry their own row presets, because sub-tier availability
// differs between publications.
const CURATED_OFFICIAL_RANKINGS: readonly CuratedOfficialRanking[] = [
  {
    targetKey: 'ssbu',
    authorKey: 'lumirank-3rd',
    authorDisplayName: 'LumiRank',
    rankingTitle: '3rd Official Tier List',
    rankingDescription:
      "LumiRank's 3rd Official Smash Bros. Ultimate tier list, compiled from the global competitive panel.",
    featuredRank: 1,
    featuredBadge: 'official',
    tiers: LUMIRANK_3RD_SSBU_TIERS,
    parentLabelByLabel: SSBU_CHILD_LABEL_PARENTS,
    tierGroups: [
      { tierName: 'S+', labels: ['Steve', 'Sonic', 'Snake'] },
      {
        tierName: 'S',
        labels: ['Mr Game And Watch', 'Rob', 'Pyra And Mythra', 'Kazuya'],
      },
      {
        tierName: 'S-',
        labels: [
          'Diddy Kong',
          'Min Min',
          'Fox',
          'Peach',
          'Daisy',
          'Joker',
          'Yoshi',
          'Pikachu',
        ],
      },
      {
        tierName: 'A+',
        labels: [
          'Roy',
          'Olimar',
          'Cloud',
          'Luigi',
          'Bayonetta',
          'Samus',
          'Dark Samus',
          'Palutena',
          'Mario',
        ],
      },
      {
        tierName: 'A',
        labels: ['Corrin', 'Wario', 'Sora', 'Falco', 'Wolf', 'Hero'],
      },
      {
        tierName: 'A-',
        labels: [
          'Ryu',
          'Shulk',
          'Mii Brawler',
          'Terry',
          'Zero Suit Samus',
          'Greninja',
          'Pac Man',
          'Pokemon Trainer',
          'Toon Link',
          'Lucina',
        ],
      },
      {
        tierName: 'B+',
        labels: [
          'Link',
          'Pit',
          'Dark Pit',
          'Captain Falcon',
          'Ken',
          'Rosalina And Luma',
        ],
      },
      {
        tierName: 'B-',
        labels: [
          'Ness',
          'Sheik',
          'Meta Knight',
          'Mega Man',
          'Inkling',
          'Sephiroth',
          'Byleth',
          'Ice Climbers',
          'Pichu',
          'Donkey Kong',
        ],
      },
      {
        tierName: 'C+',
        labels: [
          'Lucario',
          'Banjo And Kazooie',
          'Wii Fit Trainer',
          'Marth',
          'Lucas',
          'Mii Swordfighter',
          'Incineroar',
        ],
      },
      {
        tierName: 'C-',
        labels: [
          'Young Link',
          'Ridley',
          'Bowser',
          'Duck Hunt',
          'Kirby',
          'Isabelle',
          'Robin',
          'Bowser Jr',
          'Mewtwo',
          'Jigglypuff',
          'Chrom',
        ],
      },
      {
        tierName: 'D',
        labels: [
          'Mii Gunner',
          'Zelda',
          'Ike',
          'Piranha Plant',
          'Villager',
          'King Dedede',
          'King K Rool',
          'Simon',
          'Richter',
          'Dr Mario',
        ],
      },
      { tierName: 'E', labels: ['Little Mac', 'Ganondorf'] },
    ],
  },
  {
    targetKey: 'ssbu',
    authorKey: 'ultrank-4th',
    authorDisplayName: 'UltRank',
    rankingTitle: '4th Official Tier List',
    rankingDescription:
      "UltRank's 4th Official Smash Bros. Ultimate tier list, drawn from international top-player consensus.",
    featuredRank: 0,
    featuredBadge: 'official',
    tiers: ULTRANK_4TH_SSBU_TIERS,
    parentLabelByLabel: SSBU_CHILD_LABEL_PARENTS,
    tierGroups: [
      {
        tierName: 'S+',
        labels: [
          'Steve',
          'Sonic',
          'Snake',
          'Mr Game And Watch',
          'Rob',
          'Min Min',
          'Kazuya',
        ],
      },
      {
        tierName: 'S-',
        labels: [
          'Diddy Kong',
          'Pyra And Mythra',
          'Luigi',
          'Peach',
          'Daisy',
          'Yoshi',
          'Fox',
          'Joker',
        ],
      },
      {
        tierName: 'A+',
        labels: [
          'Samus',
          'Dark Samus',
          'Palutena',
          'Pikachu',
          'Olimar',
          'Wario',
        ],
      },
      {
        tierName: 'A',
        labels: [
          'Roy',
          'Hero',
          'Bayonetta',
          'Mario',
          'Wolf',
          'Mii Brawler',
          'Mega Man',
          'Sora',
          'Cloud',
          'Ryu',
        ],
      },
      {
        tierName: 'A-',
        labels: ['Corrin', 'Falco', 'Shulk', 'Captain Falcon', 'Greninja'],
      },
      {
        tierName: 'B+',
        labels: [
          'Terry',
          'Pokemon Trainer',
          'Lucina',
          'Ken',
          'Zero Suit Samus',
          'Pac Man',
          'Toon Link',
          'Link',
          'Pit',
          'Dark Pit',
          'Rosalina And Luma',
          'Ice Climbers',
          'Donkey Kong',
        ],
      },
      {
        tierName: 'B-',
        labels: [
          'Pichu',
          'Inkling',
          'Ness',
          'Sheik',
          'Byleth',
          'Meta Knight',
          'Sephiroth',
          'Duck Hunt',
        ],
      },
      {
        tierName: 'C+',
        labels: [
          'Isabelle',
          'Mii Swordfighter',
          'Lucas',
          'Wii Fit Trainer',
          'Robin',
          'Ridley',
        ],
      },
      {
        tierName: 'C-',
        labels: [
          'Banjo And Kazooie',
          'Bowser Jr',
          'Lucario',
          'Jigglypuff',
          'Marth',
          'Young Link',
          'Bowser',
          'Incineroar',
          'Kirby',
          'Piranha Plant',
        ],
      },
      { tierName: 'D+', labels: ['Mii Gunner', 'Mewtwo', 'Zelda'] },
      {
        tierName: 'D-',
        labels: [
          'Chrom',
          'Dr Mario',
          'Ike',
          'King K Rool',
          'King Dedede',
          'Villager',
        ],
      },
      {
        tierName: 'E',
        labels: ['Simon', 'Richter', 'Little Mac', 'Ganondorf'],
      },
    ],
  },
]

// favorites lane shape & config — per-criterion seed inputs that drive the
// non-primary (e.g. SSBU 'favorites') sample-ranking flow without leaking
// into the existing competitive lane's scoring
type SeedExtraLaneKey = 'ssbu-favorites' | 'zelda-favorites' | 'mcu-favorites'

interface SeedExtraLaneDefinition
{
  // unique key used by mutation args + result aggregation
  laneKey: SeedExtraLaneKey
  targetKey: TargetKey
  criterionExternalId: string
  // appended to board / tier / item externalIds so favorites & competitive
  // rows from the same author don't collide on byOwnerAndExternalId
  laneSlug: string
  // ranking title template applied per profile — "{name}'s favorite mains"
  rankingTitleSuffix: string
  rankingDescription: string
  // crowd-favorite terms — boost characters most players gravitate to
  // regardless of viability (Mario, Pikachu, Cloud, Sora, Sephiroth, etc.)
  boostTerms: readonly string[]
  // drop terms — characters typically NOT picked as a personal favorite
  // (mii fighters, clones, dr mario)
  dropTerms: readonly string[]
  // per-profile favorite picks; replaces the competitive boostTerms for
  // this lane so favorites read as personal preference instead of tournament
  // viability. profile keys w/o entries fall through to the lane's crowd
  profileBoostOverrides: Readonly<Record<string, readonly string[]>>
  profileDropOverrides?: Readonly<Record<string, readonly string[]>>
  // multiplier applied on top of profile.chaos so favorites read more
  // personal/scattered than the competitive lane
  chaosMultiplier: number
  // optional shrink applied on top of profile.contrarian (favorites are
  // less anti-crowd than tournament picks; people don't pretend to dislike
  // characters they actually love)
  contrarianMultiplier: number
}

const SSBU_FAVORITES_LANE: SeedExtraLaneDefinition = {
  laneKey: 'ssbu-favorites',
  targetKey: 'ssbu',
  criterionExternalId: 'favorites',
  laneSlug: 'favorites',
  rankingTitleSuffix: 'favorite Smash mains',
  rankingDescription:
    'Personal-preference Smash ranking — viability ignored, vibes only.',
  boostTerms: [
    'mario',
    'link',
    'pikachu',
    'sonic',
    'kirby',
    'cloud',
    'sora',
    'joker',
    'sephiroth',
    'snake',
    'pokemon trainer',
    'yoshi',
    'fox',
    'samus',
    'mega man',
    'banjo',
    'pyra and mythra',
  ],
  // miis + clones bias toward "not a favorite" because most players who
  // love a kit pick the original; dr mario's the canonical clone example
  dropTerms: [
    'mii brawler',
    'mii gunner',
    'mii swordfighter',
    'dr mario',
    'dark pit',
  ],
  // per-profile "loved mains" — each profile reads like a real friend-group
  // pick (princess stan, fire emblem diehard, heavies-only, etc.)
  profileBoostOverrides: {
    'ava-byte': ['samus', 'zero suit samus', 'palutena', 'lucas'],
    'ben-combo': ['ryu', 'ken', 'terry', 'kazuya', 'little mac'],
    'cora-quest': ['kirby', 'yoshi', 'pikachu', 'jigglypuff'],
    'diego-frame': ['wario', 'snake', 'ness', 'ridley', 'mr game and watch'],
    'elise-circuit': ['link', 'zelda', 'young link', 'toon link', 'sheik'],
    'finn-nova': [
      'banjo and kazooie',
      'duck hunt',
      'rob',
      'mr game and watch',
      'piranha plant',
    ],
    'gia-pilot': ['fox', 'falco', 'wolf', 'captain falcon'],
    'hugo-bloom': ['peach', 'daisy', 'rosalina and luma', 'isabelle'],
    'iris-lane': ['marth', 'lucina', 'ike', 'roy', 'chrom', 'corrin'],
    'jae-tempo': ['sonic', 'mega man', 'pac man', 'banjo and kazooie'],
    'kira-vale': ['sora', 'joker', 'sephiroth', 'cloud', 'hero'],
    'leo-sparks': ['bowser', 'king k rool', 'ridley', 'ganondorf', 'bowser jr'],
    'mina-orbit': ['villager', 'isabelle', 'steve', 'pyra and mythra'],
    'nico-slate': ['cloud', 'sephiroth', 'hero', 'shulk'],
    'olive-ray': ['jigglypuff', 'pichu', 'pokemon trainer', 'incineroar'],
    'pax-stone': ['donkey kong', 'diddy kong', 'yoshi', 'bowser jr'],
  },
  // every profile drops the mii fighters because favorites are personality-
  // driven; nobody picks generic placeholder fighters as their main
  profileDropOverrides: {},
  chaosMultiplier: 1.55,
  contrarianMultiplier: 0.45,
}

const ZELDA_FAVORITES_LANE: SeedExtraLaneDefinition = {
  laneKey: 'zelda-favorites',
  targetKey: 'zelda',
  criterionExternalId: 'favorites',
  laneSlug: 'favorites',
  rankingTitleSuffix: 'favorite Zelda games',
  rankingDescription:
    'Personal nostalgia + replayability ranking for the mainline Zelda series — vibes over scores.',
  // crowd-favorite Zelda titles spanning the standard 'top 5' lists
  boostTerms: [
    'ocarina',
    'breath',
    'tears',
    'majora',
    'wind waker',
    'a link to the past',
    'twilight princess',
    'links awakening',
    'a link between worlds',
    'skyward sword',
  ],
  // notoriously divisive titles that show up at the bottom of most lists
  dropTerms: [
    'zelda ii',
    'tri force heroes',
    'four swords adventures',
    'phantom hourglass',
    'spirit tracks',
  ],
  profileBoostOverrides: {
    'ava-byte': ['breath of the wild', 'tears of the kingdom'],
    'ben-combo': ['ocarina of time', 'majoras mask'],
    'cora-quest': ['ocarina of time', 'wind waker', 'breath of the wild'],
    'diego-frame': ['majoras mask', 'twilight princess'],
    'elise-circuit': ['a link to the past', 'a link between worlds'],
    'finn-nova': ['skyward sword', 'the minish cap', 'echoes of wisdom'],
    'gia-pilot': ['breath of the wild', 'tears of the kingdom'],
    'hugo-bloom': ['oracle of seasons and ages', 'the minish cap'],
    'iris-lane': ['twilight princess', 'majoras mask'],
    'jae-tempo': ['zelda ii the adventure of link', 'echoes of wisdom'],
    'kira-vale': ['ocarina of time', 'a link to the past'],
    'leo-sparks': ['links awakening', 'the minish cap'],
    'mina-orbit': ['skyward sword', 'wind waker'],
    'nico-slate': ['tears of the kingdom', 'breath of the wild'],
    'olive-ray': ['four swords adventures', 'tri force heroes'],
    'pax-stone': ['twilight princess', 'majoras mask'],
  },
  chaosMultiplier: 1.45,
  contrarianMultiplier: 0.5,
}

const MCU_FAVORITES_LANE: SeedExtraLaneDefinition = {
  laneKey: 'mcu-favorites',
  targetKey: 'mcu',
  criterionExternalId: 'favorites',
  laneSlug: 'favorites',
  rankingTitleSuffix: 'favorite MCU films',
  rankingDescription:
    'Pure rewatch-value ranking — which MCU films you actually love revisiting, not just which ones reviewed well.',
  boostTerms: [
    'iron man',
    'the avengers',
    'winter soldier',
    'civil war',
    'infinity war',
    'endgame',
    'guardians',
    'black panther',
    'ragnarok',
    'no way home',
    'spider man homecoming',
    'deadpool',
  ],
  // generally bottom-of-list MCU entries — even fans skip these on rewatch
  dropTerms: [
    'dark world',
    'incredible hulk',
    'eternals',
    'quantumania',
    'the marvels',
    'love and thunder',
    'brave new world',
  ],
  profileBoostOverrides: {
    'ava-byte': ['black widow', 'captain marvel', 'the marvels'],
    'ben-combo': ['winter soldier', 'civil war', 'shang chi'],
    'cora-quest': ['endgame', 'infinity war', 'the avengers'],
    'diego-frame': [
      'doctor strange multiverse of madness',
      'eternals',
      'thunderbolts',
    ],
    'elise-circuit': ['black panther', 'shang chi', 'wakanda forever'],
    'finn-nova': ['thor ragnarok', 'thor the dark world', 'ant man'],
    'gia-pilot': ['captain marvel', 'black widow', 'the marvels'],
    'hugo-bloom': ['guardians of the galaxy', 'ant man and the wasp'],
    'iris-lane': ['black panther', 'wakanda forever'],
    'jae-tempo': ['iron man 3', 'multiverse of madness', 'thunderbolts'],
    'kira-vale': ['no way home', 'spider man far from home', 'doctor strange'],
    'leo-sparks': ['thor', 'thor ragnarok', 'love and thunder'],
    'mina-orbit': ['eternals', 'first avenger', 'ant man'],
    'nico-slate': ['infinity war', 'endgame', 'avengers age of ultron'],
    'olive-ray': ['quantumania', 'captain marvel', 'eternals'],
    'pax-stone': ['ragnarok', 'guardians of the galaxy vol 3'],
  },
  chaosMultiplier: 1.5,
  contrarianMultiplier: 0.5,
}

const SEED_EXTRA_LANES: readonly SeedExtraLaneDefinition[] = [
  SSBU_FAVORITES_LANE,
  ZELDA_FAVORITES_LANE,
  MCU_FAVORITES_LANE,
]

const extraLaneByKey = (laneKey: SeedExtraLaneKey): SeedExtraLaneDefinition =>
{
  const lane = SEED_EXTRA_LANES.find(
    (candidate) => candidate.laneKey === laneKey
  )
  if (!lane)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: `unknown extra seed lane: ${laneKey}`,
    })
  }
  return lane
}

const extraLaneKeyValidator = v.union(
  v.literal('ssbu-favorites'),
  v.literal('zelda-favorites'),
  v.literal('mcu-favorites')
)

// curated favorites rankings — community personalities w/ editorial
// 'creator' badges, distinct from the competitive lane's official lists
const MAXIMILIAN_FAVORITES_TIERS: readonly TierPresetTier[] = [
  { name: 'Mains', colorSpec: { kind: 'palette', index: 0 } },
  { name: 'Pocket', colorSpec: { kind: 'palette', index: 1 } },
  { name: 'Solid', colorSpec: { kind: 'palette', index: 3 } },
  { name: 'Casual', colorSpec: { kind: 'palette', index: 5 } },
  { name: 'Sometimes', colorSpec: { kind: 'palette', index: 7 } },
  { name: 'Rarely', colorSpec: { kind: 'palette', index: 10 } },
]

const HUNGRYBOX_FAVORITES_TIERS: readonly TierPresetTier[] = [
  { name: 'Goated', colorSpec: { kind: 'palette', index: 0 } },
  { name: 'Beloved', colorSpec: { kind: 'palette', index: 0 } },
  { name: 'Respect', colorSpec: { kind: 'palette', index: 1 } },
  { name: 'Fine', colorSpec: { kind: 'palette', index: 3 } },
  { name: 'Mid', colorSpec: { kind: 'palette', index: 5 } },
  { name: 'Skip', colorSpec: { kind: 'palette', index: 10 } },
]

const ZELDA_PERSONAL_FAVORITES_TIERS: readonly TierPresetTier[] = [
  { name: 'GOAT', colorSpec: { kind: 'palette', index: 0 } },
  { name: 'Replay yearly', colorSpec: { kind: 'palette', index: 0 } },
  { name: 'Loved it', colorSpec: { kind: 'palette', index: 1 } },
  { name: 'Solid', colorSpec: { kind: 'palette', index: 3 } },
  { name: 'Curiosity', colorSpec: { kind: 'palette', index: 5 } },
  { name: 'Pass', colorSpec: { kind: 'palette', index: 10 } },
]

const ZELDA_NOSTALGIA_FAVORITES_TIERS: readonly TierPresetTier[] = [
  { name: 'Childhood', colorSpec: { kind: 'palette', index: 0 } },
  { name: 'Bedside', colorSpec: { kind: 'palette', index: 1 } },
  { name: 'Background', colorSpec: { kind: 'palette', index: 3 } },
  { name: 'Curio', colorSpec: { kind: 'palette', index: 5 } },
  { name: 'Skipped', colorSpec: { kind: 'palette', index: 10 } },
]

const MCU_REWATCH_FAVORITES_TIERS: readonly TierPresetTier[] = [
  { name: 'Always on', colorSpec: { kind: 'palette', index: 0 } },
  { name: 'Comfort watch', colorSpec: { kind: 'palette', index: 1 } },
  { name: 'Solid pick', colorSpec: { kind: 'palette', index: 3 } },
  { name: 'Fine', colorSpec: { kind: 'palette', index: 5 } },
  { name: 'Background', colorSpec: { kind: 'palette', index: 7 } },
  { name: 'Skip', colorSpec: { kind: 'palette', index: 10 } },
]

const MCU_PHASE_FAVORITES_TIERS: readonly TierPresetTier[] = [
  { name: 'Phase 3 peak', colorSpec: { kind: 'palette', index: 0 } },
  { name: 'Loved', colorSpec: { kind: 'palette', index: 1 } },
  { name: 'Liked', colorSpec: { kind: 'palette', index: 3 } },
  { name: 'Mid', colorSpec: { kind: 'palette', index: 5 } },
  { name: 'Forgot it existed', colorSpec: { kind: 'palette', index: 10 } },
]

const CURATED_FAVORITES_RANKINGS: readonly CuratedOfficialRanking[] = [
  {
    targetKey: 'ssbu',
    criterionExternalId: 'favorites',
    authorKey: 'maxdood-favs',
    authorDisplayName: 'Maximilian Dood',
    rankingTitle: 'All-Time Favorites',
    rankingDescription:
      "Max's all-time favorite Smash fighters — built around his fighting-game roots, hype factor, & character love over win-rate.",
    featuredRank: 0,
    featuredBadge: 'creator',
    tiers: MAXIMILIAN_FAVORITES_TIERS,
    parentLabelByLabel: SSBU_CHILD_LABEL_PARENTS,
    tierGroups: [
      {
        tierName: 'Mains',
        labels: ['Ryu', 'Ken', 'Terry', 'Kazuya', 'Sephiroth', 'Cloud'],
      },
      {
        tierName: 'Pocket',
        labels: [
          'Sora',
          'Joker',
          'Hero',
          'Mega Man',
          'Pac Man',
          'Snake',
          'Sonic',
          'Captain Falcon',
          'Little Mac',
          'Bayonetta',
        ],
      },
      {
        tierName: 'Solid',
        labels: [
          'Mario',
          'Luigi',
          'Link',
          'Young Link',
          'Toon Link',
          'Yoshi',
          'Donkey Kong',
          'Diddy Kong',
          'Fox',
          'Falco',
          'Wolf',
          'Samus',
          'Dark Samus',
          'Bowser',
          'Ganondorf',
          'King K Rool',
          'Ridley',
          'Wario',
          'Shulk',
          'Pokemon Trainer',
          'Greninja',
          'Inkling',
          'Steve',
          'Pyra And Mythra',
          'Min Min',
          'Banjo And Kazooie',
          'Mr Game And Watch',
          'Rob',
          'Roy',
          'Marth',
          'Ike',
          'Lucina',
        ],
      },
      {
        tierName: 'Casual',
        labels: [
          'Peach',
          'Daisy',
          'Zelda',
          'Sheik',
          'Palutena',
          'Pit',
          'Dark Pit',
          'Pikachu',
          'Pichu',
          'Lucario',
          'Mewtwo',
          'Jigglypuff',
          'Incineroar',
          'Kirby',
          'Meta Knight',
          'King Dedede',
          'Olimar',
          'Rosalina And Luma',
          'Robin',
          'Corrin',
          'Byleth',
          'Chrom',
          'Bowser Jr',
          'Simon',
          'Richter',
        ],
      },
      {
        tierName: 'Sometimes',
        labels: [
          'Ness',
          'Lucas',
          'Villager',
          'Isabelle',
          'Wii Fit Trainer',
          'Duck Hunt',
          'Ice Climbers',
          'Zero Suit Samus',
          'Mii Brawler',
          'Mii Swordfighter',
          'Mii Gunner',
        ],
      },
      {
        tierName: 'Rarely',
        labels: ['Dr Mario', 'Piranha Plant'],
      },
    ],
  },
  {
    targetKey: 'ssbu',
    criterionExternalId: 'favorites',
    authorKey: 'hbox-favs',
    authorDisplayName: 'Hungrybox',
    rankingTitle: 'Smash 64 Throwbacks',
    rankingDescription:
      "Hbox's nostalgia-first favorites — every fighter graded by how much love they had on the Smash 64 + Melee couch.",
    featuredRank: 1,
    featuredBadge: 'creator',
    tiers: HUNGRYBOX_FAVORITES_TIERS,
    parentLabelByLabel: SSBU_CHILD_LABEL_PARENTS,
    tierGroups: [
      {
        tierName: 'Goated',
        labels: ['Jigglypuff', 'Pikachu', 'Fox', 'Falco', 'Captain Falcon'],
      },
      {
        tierName: 'Beloved',
        labels: [
          'Mario',
          'Luigi',
          'Link',
          'Young Link',
          'Yoshi',
          'Kirby',
          'Samus',
          'Donkey Kong',
          'Ness',
          'Sheik',
          'Zelda',
          'Marth',
          'Roy',
          'Mewtwo',
          'Mr Game And Watch',
          'Pichu',
        ],
      },
      {
        tierName: 'Respect',
        labels: [
          'Peach',
          'Daisy',
          'Bowser',
          'Ice Climbers',
          'Diddy Kong',
          'Wolf',
          'Snake',
          'Sonic',
          'Mega Man',
          'Pac Man',
          'Lucas',
          'Lucina',
          'Ike',
          'Pokemon Trainer',
          'Greninja',
          'Olimar',
          'Toon Link',
          'King K Rool',
          'Ridley',
          'Cloud',
          'Sephiroth',
          'Hero',
          'Joker',
          'Sora',
          'Banjo And Kazooie',
          'Steve',
          'Pyra And Mythra',
          'Min Min',
          'Kazuya',
          'Terry',
          'Ryu',
          'Ken',
          'Bayonetta',
          'Shulk',
          'Inkling',
          'Pit',
        ],
      },
      {
        tierName: 'Fine',
        labels: [
          'Wario',
          'Lucario',
          'Robin',
          'Corrin',
          'Byleth',
          'Chrom',
          'Rosalina And Luma',
          'Palutena',
          'Dark Samus',
          'Zero Suit Samus',
          'Dark Pit',
          'King Dedede',
          'Meta Knight',
          'Ganondorf',
          'Bowser Jr',
          'Villager',
          'Isabelle',
          'Wii Fit Trainer',
          'Mii Brawler',
        ],
      },
      {
        tierName: 'Mid',
        labels: [
          'Incineroar',
          'Rob',
          'Duck Hunt',
          'Simon',
          'Richter',
          'Little Mac',
          'Piranha Plant',
          'Mii Swordfighter',
          'Mii Gunner',
        ],
      },
      {
        tierName: 'Skip',
        labels: ['Dr Mario'],
      },
    ],
  },
  {
    targetKey: 'zelda',
    criterionExternalId: 'favorites',
    authorKey: 'zeltik-favs',
    authorDisplayName: 'Zeltik',
    rankingTitle: 'Personal Favorites',
    rankingDescription:
      'Zeltik’s personal-best ranking of every mainline Zelda — based on impact, narrative, and how often he replays them.',
    featuredRank: 0,
    featuredBadge: 'creator',
    tiers: ZELDA_PERSONAL_FAVORITES_TIERS,
    tierGroups: [
      { tierName: 'GOAT', labels: ['Majoras Mask'] },
      {
        tierName: 'Replay yearly',
        labels: ['Ocarina Of Time', 'The Wind Waker'],
      },
      {
        tierName: 'Loved it',
        labels: [
          'Twilight Princess',
          'Skyward Sword',
          'Breath Of The Wild',
          'Tears Of The Kingdom',
          'A Link To The Past',
          'Links Awakening',
          'A Link Between Worlds',
          'The Minish Cap',
        ],
      },
      {
        tierName: 'Solid',
        labels: [
          'The Legend Of Zelda',
          'Oracle Of Seasons And Ages',
          'Echoes Of Wisdom',
        ],
      },
      {
        tierName: 'Curiosity',
        labels: [
          'Zelda Ii The Adventure Of Link',
          'Phantom Hourglass',
          'Spirit Tracks',
        ],
      },
      {
        tierName: 'Pass',
        labels: ['Four Swords Adventures', 'Tri Force Heroes'],
      },
    ],
  },
  {
    targetKey: 'zelda',
    criterionExternalId: 'favorites',
    authorKey: 'monstermaze-favs',
    authorDisplayName: 'Monster Maze',
    rankingTitle: 'Nostalgia Favorites',
    rankingDescription:
      'Monster Maze’s nostalgia-ranked Zelda list — the games that mattered most to him as a kid sit at the top, regardless of polish.',
    featuredRank: 1,
    featuredBadge: 'creator',
    tiers: ZELDA_NOSTALGIA_FAVORITES_TIERS,
    tierGroups: [
      {
        tierName: 'Childhood',
        labels: ['Ocarina Of Time', 'Majoras Mask', 'A Link To The Past'],
      },
      {
        tierName: 'Bedside',
        labels: [
          'Links Awakening',
          'The Minish Cap',
          'The Wind Waker',
          'Twilight Princess',
        ],
      },
      {
        tierName: 'Background',
        labels: [
          'The Legend Of Zelda',
          'Oracle Of Seasons And Ages',
          'Skyward Sword',
          'A Link Between Worlds',
          'Phantom Hourglass',
          'Spirit Tracks',
          'Breath Of The Wild',
          'Tears Of The Kingdom',
        ],
      },
      {
        tierName: 'Curio',
        labels: [
          'Zelda Ii The Adventure Of Link',
          'Four Swords Adventures',
          'Echoes Of Wisdom',
        ],
      },
      { tierName: 'Skipped', labels: ['Tri Force Heroes'] },
    ],
  },
  {
    targetKey: 'mcu',
    criterionExternalId: 'favorites',
    authorKey: 'screenjunkies-favs',
    authorDisplayName: 'ScreenJunkies',
    rankingTitle: 'Rewatch Favorites',
    rankingDescription:
      'ScreenJunkies’ rewatch-tier MCU favorites — purely about which films land in the rotation, not which ones the critics scored higher.',
    featuredRank: 0,
    featuredBadge: 'creator',
    tiers: MCU_REWATCH_FAVORITES_TIERS,
    tierGroups: [
      {
        tierName: 'Always on',
        labels: [
          'Avengers Endgame',
          'Avengers Infinity War',
          'Spider Man No Way Home',
        ],
      },
      {
        tierName: 'Comfort watch',
        labels: [
          'Iron Man',
          'The Avengers',
          'Captain America The Winter Soldier',
          'Thor Ragnarok',
          'Guardians Of The Galaxy',
          'Black Panther',
          'Captain America Civil War',
          'Spider Man Homecoming',
          'Deadpool And Wolverine',
        ],
      },
      {
        tierName: 'Solid pick',
        labels: [
          'Doctor Strange',
          'Guardians Of The Galaxy Vol 2',
          'Avengers Age Of Ultron',
          'Captain America The First Avenger',
          'Thor',
          'Iron Man 3',
          'Ant Man',
          'Spider Man Far From Home',
          'Shang Chi',
          'Guardians Of The Galaxy Vol 3',
          'Doctor Strange Multiverse Of Madness',
          'Thunderbolts',
        ],
      },
      {
        tierName: 'Fine',
        labels: [
          'Iron Man 2',
          'Black Widow',
          'Captain Marvel',
          'Ant Man And The Wasp',
          'Black Panther Wakanda Forever',
        ],
      },
      {
        tierName: 'Background',
        labels: [
          'The Incredible Hulk',
          'Thor The Dark World',
          'Eternals',
          'Thor Love And Thunder',
        ],
      },
      {
        tierName: 'Skip',
        labels: [
          'Ant Man And The Wasp Quantumania',
          'The Marvels',
          'Captain America Brave New World',
          'The Fantastic Four First Steps',
        ],
      },
    ],
  },
  {
    targetKey: 'mcu',
    criterionExternalId: 'favorites',
    authorKey: 'mcudirect-favs',
    authorDisplayName: 'MCU Direct',
    rankingTitle: 'Phase Favorites',
    rankingDescription:
      'MCU Direct’s favorites-by-phase ranking — Phase 3 sits at the top, the multiverse saga gets a more honest read.',
    featuredRank: 1,
    featuredBadge: 'creator',
    tiers: MCU_PHASE_FAVORITES_TIERS,
    tierGroups: [
      {
        tierName: 'Phase 3 peak',
        labels: [
          'Avengers Endgame',
          'Avengers Infinity War',
          'Captain America Civil War',
          'Thor Ragnarok',
          'Black Panther',
          'Spider Man Homecoming',
        ],
      },
      {
        tierName: 'Loved',
        labels: [
          'Iron Man',
          'The Avengers',
          'Captain America The Winter Soldier',
          'Guardians Of The Galaxy',
          'Doctor Strange',
          'Spider Man No Way Home',
          'Deadpool And Wolverine',
        ],
      },
      {
        tierName: 'Liked',
        labels: [
          'Thor',
          'Iron Man 3',
          'Captain America The First Avenger',
          'Avengers Age Of Ultron',
          'Guardians Of The Galaxy Vol 2',
          'Ant Man',
          'Spider Man Far From Home',
          'Shang Chi',
          'Black Panther Wakanda Forever',
          'Guardians Of The Galaxy Vol 3',
          'Doctor Strange Multiverse Of Madness',
          'Thunderbolts',
        ],
      },
      {
        tierName: 'Mid',
        labels: [
          'Iron Man 2',
          'Black Widow',
          'Captain Marvel',
          'Ant Man And The Wasp',
          'Eternals',
          'Thor Love And Thunder',
        ],
      },
      {
        tierName: 'Forgot it existed',
        labels: [
          'The Incredible Hulk',
          'Thor The Dark World',
          'Ant Man And The Wasp Quantumania',
          'The Marvels',
          'Captain America Brave New World',
          'The Fantastic Four First Steps',
        ],
      },
    ],
  },
]

// per-lane breakdown — the CLI uses this to print marketplace-style logs
// showing how many sample + curated rankings landed in each criterion lane
// for each target template
const seedLaneBreakdownValidator = v.object({
  criterionExternalId: v.string(),
  criterionName: v.string(),
  sampleSeeded: v.number(),
  curatedSeeded: v.number(),
  curatedAuthors: v.array(v.string()),
})

const seedTargetResultValidator = v.object({
  key: targetKeyValidator,
  title: v.string(),
  slug: v.string(),
  itemCount: v.number(),
  rankingsSeeded: v.number(),
  rankingsDeleted: v.number(),
  laneBreakdown: v.array(seedLaneBreakdownValidator),
})

// flat list of every curated ranking that landed during the seed run; the
// CLI uses this to call out which editorial tier lists were inserted
// (LumiRank, Maximilian Dood, Zeltik, etc.)
const seedCuratedRankingResultValidator = v.object({
  targetKey: targetKeyValidator,
  targetTitle: v.string(),
  criterionExternalId: v.string(),
  authorKey: v.string(),
  authorDisplayName: v.string(),
  rankingTitle: v.string(),
  rankingSlug: v.string(),
})

const seedCommunityRankingsResultValidator = v.object({
  usersSeeded: v.number(),
  // breaks the `rankingsSeeded` total apart so the CLI can show how many
  // came from algorithmic profiles vs curated tier lists in each lane
  sampleRankingsSeeded: v.number(),
  curatedRankingsSeeded: v.number(),
  rankingsSeeded: v.number(),
  rankingsDeleted: v.number(),
  aggregatesQueued: v.number(),
  targets: v.array(seedTargetResultValidator),
  curatedRankings: v.array(seedCuratedRankingResultValidator),
})

interface SeedTargetResolutionCriterion
{
  externalId: string
  name: string
  isPrimary: boolean
}

interface SeedTargetResolution
{
  key: TargetKey
  title: string
  slug: string
  templateId: Id<'templates'>
  itemCount: number
  // active criteria on the source template — surfaced here so the seed
  // action can build per-lane breakdowns for the CLI without a second
  // round-trip per template
  criteria: SeedTargetResolutionCriterion[]
}

interface SeedRankingResult
{
  targetKey: TargetKey
  templateSlug: string
  userEmail: string
  rankingSlug: string
  boardExternalId: string
  itemsRanked: number
  rankingsDeleted: number
}

interface SeedResetResult
{
  rankingsDeleted: number
  boardsDeleted: number
}

interface SeedLaneBreakdown
{
  criterionExternalId: string
  criterionName: string
  sampleSeeded: number
  curatedSeeded: number
  curatedAuthors: string[]
}

interface SeedTargetResult
{
  key: TargetKey
  title: string
  slug: string
  itemCount: number
  rankingsSeeded: number
  rankingsDeleted: number
  laneBreakdown: SeedLaneBreakdown[]
}

interface SeedCuratedRankingResult
{
  targetKey: TargetKey
  targetTitle: string
  criterionExternalId: string
  authorKey: string
  authorDisplayName: string
  rankingTitle: string
  rankingSlug: string
}

interface SeedCommunityRankingsResult
{
  usersSeeded: number
  sampleRankingsSeeded: number
  curatedRankingsSeeded: number
  rankingsSeeded: number
  rankingsDeleted: number
  aggregatesQueued: number
  targets: SeedTargetResult[]
  curatedRankings: SeedCuratedRankingResult[]
}

interface RankedSeedItem
{
  item: Doc<'templateItems'>
  tierIndex: number
  orderInTier: number
  globalOrder: number
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const pauseSeedWrites = async (): Promise<void> =>
{
  if (SEED_WRITE_PAUSE_MS <= 0) return
  await sleep(SEED_WRITE_PAUSE_MS)
}

const requireSeedAuthorized = (seedSecret: string): void =>
{
  if (process.env.CONVEX_SEED_ENABLED !== 'true')
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.forbidden,
      message:
        'seeding is disabled - set CONVEX_SEED_ENABLED=true on this deployment to allow it',
    })
  }

  const expectedSecret = process.env.CONVEX_SEED_SECRET
  if (!expectedSecret || seedSecret !== expectedSecret)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.forbidden,
      message: `seeding is locked - pass the deployment ${SEED_SECRET_ENV} value`,
    })
  }
}

const normalizeUserCount = (raw: number | undefined): number =>
{
  if (raw === undefined) return DEFAULT_SAMPLE_USER_COUNT
  if (!Number.isFinite(raw) || raw < 1)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: 'userCount must be a positive number',
    })
  }
  return Math.min(SAMPLE_PROFILES.length, Math.floor(raw))
}

const targetDefinitionByKey = (key: TargetKey): SeedTargetDefinition =>
{
  const target = SEED_TARGETS.find((candidate) => candidate.key === key)
  if (!target)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: `unknown seed target: ${key}`,
    })
  }
  return target
}

const sampleProfileAt = (profileIndex: number): SeedProfile =>
{
  if (
    !Number.isInteger(profileIndex) ||
    profileIndex < 0 ||
    profileIndex >= SAMPLE_PROFILES.length
  )
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: 'profileIndex is outside the sample profile range',
    })
  }
  return SAMPLE_PROFILES[profileIndex]
}

const authorUserEmail = (authorKey: string): string =>
  `seed+rankings-${authorKey}@${SEED_EMAIL_DOMAIN}`

const authorUserExternalId = (authorKey: string): string =>
  `user-seed-rankings-${authorKey}`

// laneSlug appended after target.key so an author can own independent
// rows per criterion lane (favorites vs competitive) w/o colliding on
// boards.byOwnerAndExternalId; omitted slug = legacy competitive format
const laneSegment = (laneSlug: string | undefined): string =>
  laneSlug && laneSlug.length > 0 ? `-${laneSlug}` : ''

const authorBoardExternalId = (
  authorKey: string,
  target: SeedTargetDefinition,
  laneSlug?: string
): string =>
  `board-seed-rankings-${target.key}${laneSegment(laneSlug)}-${authorKey}`

const authorTierExternalId = (
  authorKey: string,
  target: SeedTargetDefinition,
  tierIndex: number,
  laneSlug?: string
): string =>
  `tier-seed-rankings-${target.key}${laneSegment(laneSlug)}-${authorKey}-${tierIndex}`

const authorItemExternalId = (
  authorKey: string,
  target: SeedTargetDefinition,
  item: Doc<'templateItems'>,
  laneSlug?: string
): string =>
  `seed-rankings-${target.key}${laneSegment(laneSlug)}-${authorKey}-${item.order.toString().padStart(3, '0')}`

// curated authors live in their own externalId namespace so they never collide
// w/ algorithmic sample profiles
const curatedAuthorKeyNs = (authorKey: string): string => `curated-${authorKey}`

const seedUserEmail = (profile: SeedProfile): string =>
  authorUserEmail(profile.key)

const seedUserExternalId = (profile: SeedProfile): string =>
  authorUserExternalId(profile.key)

const seedBoardExternalId = (
  profile: SeedProfile,
  target: SeedTargetDefinition
): string => authorBoardExternalId(profile.key, target)

const seedRankingTitle = (
  profile: SeedProfile,
  target: SeedTargetDefinition
): string => `${profile.displayName}'s ${target.rankingTitle}`

// lane-scoped board id + ranking title — symmetric to the competitive
// helpers but scoped to a non-primary criterion. the title uses the lane
// suffix so favorites cards read "{name}'s favorite Smash mains"
const laneSeedBoardExternalId = (
  profile: SeedProfile,
  target: SeedTargetDefinition,
  lane: SeedExtraLaneDefinition
): string => authorBoardExternalId(profile.key, target, lane.laneSlug)

const laneSeedRankingTitle = (
  profile: SeedProfile,
  lane: SeedExtraLaneDefinition
): string => `${profile.displayName}'s ${lane.rankingTitleSuffix}`

const deleteLaneSeedPair = async (
  ctx: MutationCtx,
  user: Doc<'users'>,
  templateId: Id<'templates'>,
  profile: SeedProfile,
  target: SeedTargetDefinition,
  lane: SeedExtraLaneDefinition
): Promise<SeedResetResult> =>
  await deleteAuthorSeedPair(ctx, {
    user,
    templateId,
    boardExternalId: laneSeedBoardExternalId(profile, target, lane),
    rankingTitle: laneSeedRankingTitle(profile, lane),
  })

const stableHash = (value: string): number =>
{
  let hash = 2166136261
  for (let i = 0; i < value.length; i++)
  {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const unitHash = (value: string): number => stableHash(value) / 0xffffffff

const termMatches = (label: string, terms: readonly string[]): number =>
  terms.reduce((sum, term) => (label.includes(term) ? sum + 1 : sum), 0)

const scoreTemplateItem = (
  target: SeedTargetDefinition,
  profile: SeedProfile,
  item: Doc<'templateItems'>
): number =>
{
  const label = (item.label ?? item.externalId).toLowerCase()
  const crowd = unitHash(`crowd:${target.key}:${label}`)
  const personal = unitHash(`personal:${profile.key}:${target.key}:${label}`)
  const baseCrowd = crowd * (1 - profile.contrarian)
  const baseContrarian = (1 - crowd) * profile.contrarian
  let score = (baseCrowd + baseContrarian) * (1 - profile.chaos)
  score += personal * profile.chaos
  score += termMatches(label, target.boostTerms) * 0.2
  score -= termMatches(label, target.dropTerms) * 0.24
  score += termMatches(label, profile.boostTerms[target.key] ?? []) * 0.3
  score -= termMatches(label, profile.dropTerms?.[target.key] ?? []) * 0.3
  return score
}

const tierWeights = (tierCount: number): number[] =>
{
  if (tierCount === 6) return [0.14, 0.19, 0.22, 0.2, 0.15, 0.1]
  return Array.from({ length: tierCount }, () => 1 / tierCount)
}

const resolveTierQuotas = (itemCount: number, tierCount: number): number[] =>
{
  const weights = tierWeights(tierCount)
  const minQuota = itemCount >= tierCount ? 1 : 0
  const raw = weights.map((weight) => weight * itemCount)
  const quotas = raw.map((quota) => Math.max(minQuota, Math.floor(quota)))
  let sum = quotas.reduce((total, quota) => total + quota, 0)

  for (let i = quotas.length - 1; sum > itemCount && i >= 0; i--)
  {
    while (sum > itemCount && quotas[i] > minQuota)
    {
      quotas[i] -= 1
      sum -= 1
    }
  }

  while (sum < itemCount)
  {
    let bestIndex = 0
    let bestGap = -Infinity
    for (let i = 0; i < quotas.length; i++)
    {
      const gap = raw[i] - quotas[i]
      if (gap > bestGap)
      {
        bestGap = gap
        bestIndex = i
      }
    }
    quotas[bestIndex] += 1
    sum += 1
  }

  return quotas
}

const rankTemplateItemsWithScore = (
  items: readonly Doc<'templateItems'>[],
  tiers: readonly TierPresetTier[],
  scoreItem: (item: Doc<'templateItems'>) => number
): RankedSeedItem[] =>
{
  const scored = items
    .map((item) => ({
      item,
      score: scoreItem(item),
    }))
    .sort((a, b) => b.score - a.score || a.item.order - b.item.order)
  const quotas = resolveTierQuotas(items.length, tiers.length)
  const ranked: RankedSeedItem[] = []
  let cursor = 0

  for (let tierIndex = 0; tierIndex < quotas.length; tierIndex++)
  {
    for (let orderInTier = 0; orderInTier < quotas[tierIndex]; orderInTier++)
    {
      const entry = scored[cursor]
      if (!entry) break
      ranked.push({
        item: entry.item,
        tierIndex,
        orderInTier,
        globalOrder: ranked.length,
      })
      cursor += 1
    }
  }

  return ranked
}

const rankTemplateItems = (
  target: SeedTargetDefinition,
  profile: SeedProfile,
  items: readonly Doc<'templateItems'>[],
  tiers: readonly TierPresetTier[]
): RankedSeedItem[] =>
  rankTemplateItemsWithScore(items, tiers, (item) =>
    scoreTemplateItem(target, profile, item)
  )

// favorites scoring uses lane crowd + per-profile favorite picks instead
// of competitive signal; chaos/contrarian scale by the lane multipliers
// so personal lanes feel less anchored to a single "correct" answer
const scoreFavoriteItem = (
  lane: SeedExtraLaneDefinition,
  profile: SeedProfile,
  item: Doc<'templateItems'>
): number =>
{
  const label = (item.label ?? item.externalId).toLowerCase()
  const crowd = unitHash(`crowd-fav:${lane.laneKey}:${label}`)
  const personal = unitHash(
    `personal-fav:${profile.key}:${lane.laneKey}:${label}`
  )
  const chaos = Math.min(1, profile.chaos * lane.chaosMultiplier)
  const contrarian = Math.min(1, profile.contrarian * lane.contrarianMultiplier)
  const baseCrowd = crowd * (1 - contrarian)
  const baseContrarian = (1 - crowd) * contrarian
  let score = (baseCrowd + baseContrarian) * (1 - chaos)
  score += personal * chaos
  score += termMatches(label, lane.boostTerms) * 0.18
  score -= termMatches(label, lane.dropTerms) * 0.28
  // per-profile favorite mains weigh much heavier than the lane crowd —
  // these are the picks that define each profile's personality
  score +=
    termMatches(label, lane.profileBoostOverrides[profile.key] ?? []) * 0.55
  score -=
    termMatches(label, lane.profileDropOverrides?.[profile.key] ?? []) * 0.3
  return score
}

const rankTemplateItemsForLane = (
  lane: SeedExtraLaneDefinition,
  profile: SeedProfile,
  items: readonly Doc<'templateItems'>[],
  tiers: readonly TierPresetTier[]
): RankedSeedItem[] =>
  rankTemplateItemsWithScore(items, tiers, (item) =>
    scoreFavoriteItem(lane, profile, item)
  )

const curatedTierIndexByName = (
  curated: CuratedOfficialRanking
): Map<string, number> =>
{
  const map = new Map<string, number>()
  curated.tiers.forEach((tier, index) =>
  {
    const name = tier.name.trim()
    if (!name || map.has(name))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: `curated tier list ${curated.authorKey}: duplicate or blank tier '${tier.name}'`,
      })
    }
    map.set(name, index)
  })
  return map
}

const requireCuratedTierIndex = (
  curated: CuratedOfficialRanking,
  tiersByName: ReadonlyMap<string, number>,
  tierName: string
): number =>
{
  const tierIndex = tiersByName.get(tierName)
  if (tierIndex !== undefined) return tierIndex
  throw new ConvexError({
    code: CONVEX_ERROR_CODES.invalidState,
    message: `curated tier list ${curated.authorKey}: unknown tier '${tierName}'`,
  })
}

const mapItemsToCuratedTiers = (
  curated: CuratedOfficialRanking,
  items: readonly Doc<'templateItems'>[]
): RankedSeedItem[] =>
{
  const itemByLabel = new Map<string, Doc<'templateItems'>>()
  for (const item of items)
  {
    if (item.label) itemByLabel.set(item.label, item)
  }

  const tiersByName = curatedTierIndexByName(curated)
  const tierIndexByLabel = new Map<string, number>()
  const labelsByTier = new Map<number, string[]>()
  for (const group of curated.tierGroups)
  {
    const tierIndex = requireCuratedTierIndex(
      curated,
      tiersByName,
      group.tierName
    )
    for (const label of group.labels)
    {
      tierIndexByLabel.set(label, tierIndex)
    }
    const list = labelsByTier.get(tierIndex) ?? []
    list.push(...group.labels)
    labelsByTier.set(tierIndex, list)
  }
  // composite parent slot, so the splits stay out of the board entirely
  const skippedChildLabels = new Set<string>()
  if (curated.parentLabelByLabel)
  {
    for (const [child, parent] of Object.entries(curated.parentLabelByLabel))
    {
      if (!tierIndexByLabel.has(parent))
      {
        throw new ConvexError({
          code: CONVEX_ERROR_CODES.invalidState,
          message: `curated tier list ${curated.authorKey}: parent label '${parent}' missing for child '${child}'`,
        })
      }
      skippedChildLabels.add(child)
    }
  }

  // every curated label must reference a real template item
  for (const label of tierIndexByLabel.keys())
  {
    if (!itemByLabel.has(label))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.invalidState,
        message: `curated tier list ${curated.authorKey}: no template item with label '${label}'`,
      })
    }
  }
  // every template item must be placed or explicitly skipped via parent map
  for (const item of items)
  {
    const label = item.label ?? ''
    if (tierIndexByLabel.has(label)) continue
    if (skippedChildLabels.has(label)) continue
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: `curated tier list ${curated.authorKey}: template item '${label || item.externalId}' is not placed`,
    })
  }

  const ranked: RankedSeedItem[] = []
  const tierIndices = [...labelsByTier.keys()].sort((a, b) => a - b)
  for (const tierIndex of tierIndices)
  {
    const labels = labelsByTier.get(tierIndex) ?? []
    let orderInTier = 0
    for (const label of labels)
    {
      const item = itemByLabel.get(label)
      if (!item) continue
      ranked.push({
        item,
        tierIndex,
        orderInTier: orderInTier++,
        globalOrder: ranked.length,
      })
    }
  }
  return ranked
}

const assertSeedRowsWithinLimit = <T>(
  label: string,
  rows: readonly T[],
  max: number
): void =>
{
  if (rows.length <= max) return
  throw new ConvexError({
    code: CONVEX_ERROR_CODES.invalidState,
    message: `${label} exceeds the seed script safety limit`,
  })
}

const findSeedUser = async (
  ctx: MutationCtx,
  profile: SeedProfile
): Promise<Doc<'users'> | null> =>
  await findUserByEmail(ctx, seedUserEmail(profile))

const findUserByEmail = async (
  ctx: MutationCtx,
  email: string
): Promise<Doc<'users'> | null> =>
  await ctx.db
    .query('users')
    .withIndex('email', (q) => q.eq('email', email))
    .unique()

const ensureSeedUser = async (
  ctx: MutationCtx,
  profile: SeedProfile,
  now: number
): Promise<Doc<'users'>> =>
  await upsertSeedUser(ctx, {
    email: seedUserEmail(profile),
    externalId: seedUserExternalId(profile),
    displayName: profile.displayName,
    now,
  })

const upsertSeedUser = async (
  ctx: MutationCtx,
  args: {
    email: string
    externalId: string
    displayName: string
    now: number
  }
): Promise<Doc<'users'>> =>
{
  const existing = await findUserByEmail(ctx, args.email)
  const fields = {
    name: args.displayName,
    displayName: args.displayName,
    email: args.email,
    externalId: args.externalId,
    createdAt: existing?.createdAt ?? args.now,
    updatedAt: args.now,
    plan: 'free' as const,
  }

  if (existing)
  {
    await ctx.db.patch(existing._id, {
      ...fields,
      lastUpsertError: undefined,
    })
    const updated = await ctx.db.get(existing._id)
    if (!updated)
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `seed user missing after update: ${args.email}`,
      })
    }
    return updated
  }

  const userId = await ctx.db.insert('users', fields)
  const inserted = await ctx.db.get(userId)
  if (!inserted)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.notFound,
      message: `seed user missing after insert: ${args.email}`,
    })
  }
  return inserted
}

const deleteRankingWithChildren = async (
  ctx: MutationCtx,
  ranking: Doc<'publishedRankings'>
): Promise<void> =>
{
  const [items, tiers] = await Promise.all([
    ctx.db
      .query('publishedRankingItems')
      .withIndex('byRanking', (q) => q.eq('rankingId', ranking._id))
      .take(MAX_SEED_ROW_ITEMS + 1),
    ctx.db
      .query('publishedRankingTiers')
      .withIndex('byRanking', (q) => q.eq('rankingId', ranking._id))
      .take(MAX_SEED_ROW_TIERS + 1),
  ])
  assertSeedRowsWithinLimit(
    'published ranking items',
    items,
    MAX_SEED_ROW_ITEMS
  )
  assertSeedRowsWithinLimit(
    'published ranking tiers',
    tiers,
    MAX_SEED_ROW_TIERS
  )
  await Promise.all([
    ...items.map((item) => ctx.db.delete(item._id)),
    ...tiers.map((tier) => ctx.db.delete(tier._id)),
    ctx.db.delete(ranking._id),
  ])
}

const deleteBoardWithChildren = async (
  ctx: MutationCtx,
  board: Doc<'boards'>
): Promise<void> =>
{
  const [items, tiers] = await Promise.all([
    ctx.db
      .query('boardItems')
      .withIndex('byBoardAndTier', (q) => q.eq('boardId', board._id))
      .take(MAX_SEED_ROW_ITEMS + 1),
    ctx.db
      .query('boardTiers')
      .withIndex('byBoard', (q) => q.eq('boardId', board._id))
      .take(MAX_SEED_ROW_TIERS + 1),
  ])
  assertSeedRowsWithinLimit('board items', items, MAX_SEED_ROW_ITEMS)
  assertSeedRowsWithinLimit('board tiers', tiers, MAX_SEED_ROW_TIERS)
  await Promise.all([
    ...items.map((item) => ctx.db.delete(item._id)),
    ...tiers.map((tier) => ctx.db.delete(tier._id)),
    ctx.db.delete(board._id),
  ])
}

const findSeedBoard = async (
  ctx: MutationCtx,
  userId: Id<'users'>,
  boardExternalId: string
): Promise<Doc<'boards'> | null> =>
  await ctx.db
    .query('boards')
    .withIndex('byOwnerAndExternalId', (q) =>
      q.eq('ownerId', userId).eq('externalId', boardExternalId)
    )
    .unique()

const adjustTemplateUseCount = async (
  ctx: MutationCtx,
  templateId: Id<'templates'>,
  delta: number,
  now: number
): Promise<void> =>
{
  if (delta === 0) return

  const stats = await findTemplateStatsByTemplateId(ctx, templateId)
  const card = await findTemplateCardByTemplateId(ctx, templateId)
  if (!stats || !card) return

  const useCount = Math.max(0, stats.useCount + delta)
  await Promise.all([
    ctx.db.patch(stats._id, {
      useCount,
      updatedAt: now,
    }),
    ctx.db.patch(card._id, {
      useCount,
    }),
  ])
}

const deleteSeedPair = async (
  ctx: MutationCtx,
  user: Doc<'users'>,
  templateId: Id<'templates'>,
  profile: SeedProfile,
  target: SeedTargetDefinition
): Promise<SeedResetResult> =>
  await deleteAuthorSeedPair(ctx, {
    user,
    templateId,
    boardExternalId: seedBoardExternalId(profile, target),
    rankingTitle: seedRankingTitle(profile, target),
  })

const deleteAuthorSeedPair = async (
  ctx: MutationCtx,
  args: {
    user: Doc<'users'>
    templateId: Id<'templates'>
    boardExternalId: string
    rankingTitle: string
  }
): Promise<SeedResetResult> =>
{
  const board = await findSeedBoard(ctx, args.user._id, args.boardExternalId)
  const rankingRows = await ctx.db
    .query('publishedRankings')
    .withIndex('bySourceTemplateOwnerPublicCreatedAt', (q) =>
      q
        .eq('sourceTemplateId', args.templateId)
        .eq('ownerId', args.user._id)
        .eq('isPubliclyListable', true)
    )
    .take(MAX_SEED_OWNER_RANKINGS)
  const rankings = new Map<Id<'publishedRankings'>, Doc<'publishedRankings'>>()

  for (const ranking of rankingRows)
  {
    if (
      ranking.title === args.rankingTitle ||
      ranking.sourceBoardId === board?._id
    )
    {
      rankings.set(ranking._id, ranking)
    }
  }

  for (const ranking of rankings.values())
  {
    await deleteRankingWithChildren(ctx, ranking)
  }
  if (board) await deleteBoardWithChildren(ctx, board)
  if (board) await adjustTemplateUseCount(ctx, args.templateId, -1, Date.now())

  return {
    rankingsDeleted: rankings.size,
    boardsDeleted: board ? 1 : 0,
  }
}

interface InsertSeedRankingArgs
{
  user: Doc<'users'>
  template: Doc<'templates'>
  target: SeedTargetDefinition
  authorKey: string
  rankedItems: readonly RankedSeedItem[]
  tiers: readonly TierPresetTier[]
  rankingTitle: string
  rankingDescription: string
  createdAt: number
  useCountAdjustedAt: number
  viewCountSeedKey: string
  // criterion external id this ranking answers; omit to default to the
  // template's active primary criterion (preserves the legacy competitive-
  // only seed flow)
  criterionExternalId?: string
  // when present, board / tier / item externalIds get this segment appended
  // so non-primary lanes don't collide w/ the primary lane's seed rows for
  // the same author
  laneSlug?: string
}

interface InsertSeedRankingResult
{
  rankingSlug: string
  itemsRanked: number
  boardExternalId: string
}

const insertSeedRanking = async (
  ctx: MutationCtx,
  args: InsertSeedRankingArgs
): Promise<InsertSeedRankingResult> =>
{
  const {
    user,
    template,
    target,
    authorKey,
    rankedItems,
    tiers,
    rankingTitle,
    rankingDescription,
    createdAt,
    viewCountSeedKey,
    criterionExternalId,
    laneSlug,
  } = args

  const boardExternalId = authorBoardExternalId(authorKey, target, laneSlug)
  const boardId = await ctx.db.insert('boards', {
    externalId: boardExternalId,
    ownerId: user._id,
    title: normalizeBoardTitle(rankingTitle),
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    revision: 1,
    sourceTemplateId: template._id,
    sourceTemplateCategory: template.category,
    sourceTemplateSizeClass: template.sizeClass,
    ...buildFreshBoardCloudFields(createdAt),
    itemAspectRatio: template.itemAspectRatio ?? undefined,
    itemAspectRatioMode: template.itemAspectRatioMode ?? undefined,
    defaultItemImageFit: template.defaultItemImageFit ?? undefined,
    labels: template.labels ?? undefined,
    activeItemCount: rankedItems.length,
    unrankedItemCount: 0,
    templateProgressState: resolveTemplateProgressState(template._id, {
      activeItemCount: rankedItems.length,
      unrankedItemCount: 0,
    }),
    librarySummary: EMPTY_BOARD_LIBRARY_SUMMARY,
  })

  const tierEntries = await Promise.all(
    tiers.map(async (tier, order) =>
    {
      const externalId = authorTierExternalId(
        authorKey,
        target,
        order,
        laneSlug
      )
      const boardTierId = await ctx.db.insert('boardTiers', {
        boardId,
        externalId,
        name: tier.name,
        description: tier.description,
        colorSpec: tier.colorSpec,
        rowColorSpec: tier.rowColorSpec,
        order,
      })
      return {
        boardTierId,
        externalId,
        order,
        colorSpec: tier.colorSpec,
        rowColorSpec: tier.rowColorSpec,
        name: tier.name,
        description: tier.description ?? null,
      }
    })
  )

  const summaryTiers: BoardLibrarySummaryTier[] = tierEntries.map((tier) => ({
    key: tier.externalId,
    order: tier.order,
    colorSpec: tier.colorSpec,
  }))
  const summaryItems: BoardLibrarySummaryItem[] = await Promise.all(
    rankedItems.map(async (ranked) =>
    {
      const tier = tierEntries[ranked.tierIndex]
      const externalId = authorItemExternalId(
        authorKey,
        target,
        ranked.item,
        laneSlug
      )
      await ctx.db.insert('boardItems', {
        boardId,
        tierId: tier.boardTierId,
        externalId,
        label: ranked.item.label ?? undefined,
        backgroundColor: ranked.item.backgroundColor ?? undefined,
        altText: ranked.item.altText ?? undefined,
        mediaAssetId: ranked.item.mediaAssetId,
        order: ranked.orderInTier,
        deletedAt: null,
        aspectRatio: ranked.item.aspectRatio ?? undefined,
        imageFit: ranked.item.imageFit ?? undefined,
        transform: ranked.item.transform ?? undefined,
        templateItemId: ranked.item._id,
      })
      return {
        tierKey: tier.externalId,
        externalId,
        label: ranked.item.label,
        storageId: await loadMediaVariantStorageId(
          ctx,
          ranked.item.mediaAssetId
        ),
        order: ranked.orderInTier,
        deletedAt: null,
      }
    })
  )
  await ctx.db.patch(boardId, {
    librarySummary: buildBoardLibrarySummary({
      tiers: summaryTiers,
      items: summaryItems,
    }),
  })

  const rankingSlug = await allocateRankingSlug(ctx)
  const viewCount = Math.floor(unitHash(viewCountSeedKey) * 24)
  // resolveActiveTemplateCriterion enforces status==='active' so we don't
  // accidentally seed into a hidden/deprecated lane via stale config
  const criterion = resolveActiveTemplateCriterion(
    template,
    criterionExternalId
  )
  const criterionSnapshot = toTemplateCriterionSnapshot(criterion)
  const rankingId = await ctx.db.insert('publishedRankings', {
    slug: rankingSlug,
    ownerId: user._id,
    sourceTemplateId: template._id,
    sourceBoardId: boardId,
    sourceTemplateSlug: template.slug,
    sourceTemplateTitle: template.title,
    sourceTemplateCategory: template.category,
    sourceCriterionExternalId: criterionSnapshot.externalId,
    sourceCriterionNameSnapshot: criterionSnapshot.name,
    sourceCriterionPromptSnapshot: criterionSnapshot.prompt,
    title: normalizeRankingTitle(rankingTitle),
    description: normalizeRankingDescription(rankingDescription),
    visibility: 'public',
    publicationState: 'published',
    isPubliclyListable: true,
    supersededAt: null,
    supersededByRankingId: null,
    itemCount: rankedItems.length,
    tierCount: tierEntries.length,
    remixCount: 0,
    viewCount,
    topScore: rankingTopScore({ viewCount, remixCount: 0 }),
    isFeatured: false,
    featuredRank: null,
    featuredBadge: null,
    createdAt,
    updatedAt: createdAt,
  })

  await Promise.all([
    ...tierEntries.map((tier) =>
      ctx.db.insert('publishedRankingTiers', {
        rankingId,
        externalId: tier.externalId,
        name: tier.name,
        description: tier.description,
        colorSpec: tier.colorSpec,
        rowColorSpec: tier.rowColorSpec ?? null,
        order: tier.order,
      })
    ),
    ...rankedItems.map((ranked) =>
    {
      const tier = tierEntries[ranked.tierIndex]
      return ctx.db.insert('publishedRankingItems', {
        rankingId,
        templateItemId: ranked.item._id,
        templateItemExternalId: ranked.item.externalId,
        externalId: authorItemExternalId(
          authorKey,
          target,
          ranked.item,
          laneSlug
        ),
        tierExternalId: tier.externalId,
        label: ranked.item.label,
        backgroundColor: ranked.item.backgroundColor,
        altText: ranked.item.altText,
        mediaAssetId: ranked.item.mediaAssetId,
        order: ranked.globalOrder,
        aspectRatio: ranked.item.aspectRatio,
        imageFit: ranked.item.imageFit,
        transform: ranked.item.transform,
      })
    }),
  ])
  await adjustTemplateUseCount(ctx, template._id, 1, args.useCountAdjustedAt)

  return {
    rankingSlug,
    itemsRanked: rankedItems.length,
    boardExternalId,
  }
}

const resolveTemplateTiers = (
  template: Doc<'templates'>
): readonly TierPresetTier[] =>
  template.suggestedTiers.length > 0
    ? template.suggestedTiers
    : DEFAULT_TEMPLATE_TIERS

const loadSeedTemplateItems = async (
  ctx: MutationCtx,
  template: Doc<'templates'>,
  target: SeedTargetDefinition
): Promise<Doc<'templateItems'>[]> =>
{
  // byTemplate index is [templateId, order] so rows arrive ordered by `order`
  const templateItems = await loadTemplateItems(ctx, template._id)
  if (templateItems.length === 0)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidState,
      message: `seed template has no items: ${target.title}`,
    })
  }
  assertSeedRowsWithinLimit('template items', templateItems, MAX_SEED_ROW_ITEMS)
  return templateItems
}

const findPublishedTargetTemplateForCard = async (
  ctx: QueryCtx,
  card: Doc<'templateCards'> | undefined,
  target: SeedTargetDefinition
): Promise<Doc<'templates'> | null> =>
{
  if (
    !card ||
    card.title !== target.title ||
    card.category !== target.category
  )
  {
    return null
  }
  const template = await ctx.db.get(card.templateId)
  return template && isPublishedTemplateRow(template) ? template : null
}

const resolveTargetTemplate = async (
  ctx: QueryCtx,
  target: SeedTargetDefinition
): Promise<Doc<'templates'>> =>
{
  const featuredCards = await ctx.db
    .query('templateCards')
    .withIndex('byIsPubliclyListableFeaturedRank', (q) =>
      q.eq('isPubliclyListable', true).eq('featuredRank', target.featuredRank)
    )
    .take(4)
  for (const card of featuredCards)
  {
    const template = await findPublishedTargetTemplateForCard(ctx, card, target)
    if (template) return template
  }

  const cards = await ctx.db
    .query('templateCards')
    .withIndex('byCategoryIsPubliclyListableUpdatedAt', (q) =>
      q.eq('category', target.category).eq('isPubliclyListable', true)
    )
    .order('desc')
    .take(MAX_TARGET_SEARCH_CARDS)
  for (const card of cards)
  {
    const template = await findPublishedTargetTemplateForCard(ctx, card, target)
    if (template) return template
  }

  throw new ConvexError({
    code: CONVEX_ERROR_CODES.notFound,
    message: `seed target template not found: ${target.title}`,
  })
}

export const resolveSeedTargetsImpl = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      key: targetKeyValidator,
      title: v.string(),
      slug: v.string(),
      templateId: v.id('templates'),
      itemCount: v.number(),
      criteria: v.array(
        v.object({
          externalId: v.string(),
          name: v.string(),
          isPrimary: v.boolean(),
        })
      ),
    })
  ),
  handler: async (ctx): Promise<SeedTargetResolution[]> =>
    await Promise.all(
      SEED_TARGETS.map(async (target) =>
      {
        const template = await resolveTargetTemplate(ctx, target)
        const criteria = resolveTemplateCriteria(template)
          .filter((c) => c.status === 'active')
          .sort((a, b) => a.order - b.order)
          .map((c) => ({
            externalId: c.externalId,
            name: c.name,
            isPrimary: c.isPrimary,
          }))
        return {
          key: target.key,
          title: template.title,
          slug: template.slug,
          templateId: template._id,
          itemCount: template.itemCount,
          criteria,
        }
      })
    ),
})

export const resetSeedPairImpl = internalMutation({
  args: {
    targetKey: targetKeyValidator,
    templateId: v.id('templates'),
    profileIndex: v.number(),
  },
  returns: v.object({
    rankingsDeleted: v.number(),
    boardsDeleted: v.number(),
  }),
  handler: async (ctx, args): Promise<SeedResetResult> =>
  {
    const profile = sampleProfileAt(args.profileIndex)
    const user = await findSeedUser(ctx, profile)
    if (!user) return { rankingsDeleted: 0, boardsDeleted: 0 }

    return await deleteSeedPair(
      ctx,
      user,
      args.templateId,
      profile,
      targetDefinitionByKey(args.targetKey)
    )
  },
})

export const seedSampleRankingImpl = internalMutation({
  args: {
    targetKey: targetKeyValidator,
    templateId: v.id('templates'),
    profileIndex: v.number(),
  },
  returns: v.object({
    targetKey: targetKeyValidator,
    templateSlug: v.string(),
    userEmail: v.string(),
    rankingSlug: v.string(),
    boardExternalId: v.string(),
    itemsRanked: v.number(),
    rankingsDeleted: v.number(),
  }),
  handler: async (ctx, args): Promise<SeedRankingResult> =>
  {
    const target = targetDefinitionByKey(args.targetKey)
    const profile = sampleProfileAt(args.profileIndex)
    const template = await ctx.db.get(args.templateId)
    if (!template || !isPublishedTemplateRow(template))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `seed template missing or unpublished: ${target.title}`,
      })
    }

    const now = Date.now()
    const user = await ensureSeedUser(ctx, profile, now)
    const deleted = await deleteSeedPair(
      ctx,
      user,
      template._id,
      profile,
      target
    )
    const templateItems = await loadSeedTemplateItems(ctx, template, target)

    const tiers = resolveTemplateTiers(template)
    assertSeedRowsWithinLimit('template tiers', tiers, MAX_SEED_ROW_TIERS)
    const rankedItems = rankTemplateItems(target, profile, templateItems, tiers)
    const createdAt =
      now - (args.profileIndex * SEED_TARGETS.length + 1) * HOUR_MS
    const title = seedRankingTitle(profile, target)
    const inserted = await insertSeedRanking(ctx, {
      user,
      template,
      target,
      authorKey: profile.key,
      rankedItems,
      tiers,
      rankingTitle: title,
      rankingDescription:
        'Seeded sample ranking for community feature testing.',
      createdAt,
      useCountAdjustedAt: now,
      viewCountSeedKey: `views:${profile.key}:${target.key}`,
    })

    return {
      targetKey: target.key,
      templateSlug: template.slug,
      userEmail: seedUserEmail(profile),
      rankingSlug: inserted.rankingSlug,
      boardExternalId: inserted.boardExternalId,
      itemsRanked: inserted.itemsRanked,
      rankingsDeleted: deleted.rankingsDeleted,
    }
  },
})

export const resetExtraLaneSeedPairImpl = internalMutation({
  args: {
    laneKey: extraLaneKeyValidator,
    templateId: v.id('templates'),
    profileIndex: v.number(),
  },
  returns: v.object({
    rankingsDeleted: v.number(),
    boardsDeleted: v.number(),
  }),
  handler: async (ctx, args): Promise<SeedResetResult> =>
  {
    const lane = extraLaneByKey(args.laneKey)
    const target = targetDefinitionByKey(lane.targetKey)
    const profile = sampleProfileAt(args.profileIndex)
    const user = await findSeedUser(ctx, profile)
    if (!user) return { rankingsDeleted: 0, boardsDeleted: 0 }
    return await deleteLaneSeedPair(
      ctx,
      user,
      args.templateId,
      profile,
      target,
      lane
    )
  },
})

export const seedExtraLaneSampleRankingImpl = internalMutation({
  args: {
    laneKey: extraLaneKeyValidator,
    templateId: v.id('templates'),
    profileIndex: v.number(),
  },
  returns: v.object({
    targetKey: targetKeyValidator,
    templateSlug: v.string(),
    userEmail: v.string(),
    rankingSlug: v.string(),
    boardExternalId: v.string(),
    itemsRanked: v.number(),
    rankingsDeleted: v.number(),
  }),
  handler: async (ctx, args): Promise<SeedRankingResult> =>
  {
    const lane = extraLaneByKey(args.laneKey)
    const target = targetDefinitionByKey(lane.targetKey)
    const profile = sampleProfileAt(args.profileIndex)
    const template = await ctx.db.get(args.templateId)
    if (!template || !isPublishedTemplateRow(template))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `seed template missing or unpublished: ${target.title}`,
      })
    }

    const now = Date.now()
    const user = await ensureSeedUser(ctx, profile, now)
    const deleted = await deleteLaneSeedPair(
      ctx,
      user,
      template._id,
      profile,
      target,
      lane
    )
    const templateItems = await loadSeedTemplateItems(ctx, template, target)

    const tiers = resolveTemplateTiers(template)
    assertSeedRowsWithinLimit('template tiers', tiers, MAX_SEED_ROW_TIERS)
    const rankedItems = rankTemplateItemsForLane(
      lane,
      profile,
      templateItems,
      tiers
    )
    // favorites lane uses a half-hour offset on top of the competitive
    // ladder so the two lanes don't collide on createdAt sorts
    const createdAt =
      now -
      (args.profileIndex * SEED_TARGETS.length + 1) * HOUR_MS -
      HOUR_MS / 2
    const title = laneSeedRankingTitle(profile, lane)
    const inserted = await insertSeedRanking(ctx, {
      user,
      template,
      target,
      authorKey: profile.key,
      rankedItems,
      tiers,
      rankingTitle: title,
      rankingDescription: lane.rankingDescription,
      createdAt,
      useCountAdjustedAt: now,
      viewCountSeedKey: `views:${profile.key}:${lane.laneKey}`,
      criterionExternalId: lane.criterionExternalId,
      laneSlug: lane.laneSlug,
    })

    return {
      targetKey: target.key,
      templateSlug: template.slug,
      userEmail: seedUserEmail(profile),
      rankingSlug: inserted.rankingSlug,
      boardExternalId: inserted.boardExternalId,
      itemsRanked: inserted.itemsRanked,
      rankingsDeleted: deleted.rankingsDeleted,
    }
  },
})

// flat list of every curated ranking (competitive + favorites for every
// target); indexed by position so the seed mutations reach them by id
const ALL_CURATED_RANKINGS: readonly CuratedOfficialRanking[] = [
  ...CURATED_OFFICIAL_RANKINGS,
  ...CURATED_FAVORITES_RANKINGS,
]

const curatedRankingAt = (index: number): CuratedOfficialRanking | undefined =>
  ALL_CURATED_RANKINGS[index]

const requireCuratedRankingAt = (index: number): CuratedOfficialRanking =>
{
  const curated = curatedRankingAt(index)
  if (!curated)
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: `curatedIndex out of range: ${index}`,
    })
  }
  return curated
}

const curatedAuthorEmail = (curated: CuratedOfficialRanking): string =>
  authorUserEmail(curatedAuthorKeyNs(curated.authorKey))

const curatedAuthorExternalId = (curated: CuratedOfficialRanking): string =>
  authorUserExternalId(curatedAuthorKeyNs(curated.authorKey))

// curated lane slug — defaults to undefined (legacy primary externalId
// format). non-primary curated lists use the criterion externalId so
// storage stays self-describing across competitive + favorites lanes
const curatedLaneSlug = (curated: CuratedOfficialRanking): string | undefined =>
  curated.criterionExternalId

const curatedBoardExternalId = (
  curated: CuratedOfficialRanking,
  target: SeedTargetDefinition
): string =>
  authorBoardExternalId(
    curatedAuthorKeyNs(curated.authorKey),
    target,
    curatedLaneSlug(curated)
  )

const curatedRankingTitle = (curated: CuratedOfficialRanking): string =>
  `${curated.authorDisplayName}'s ${curated.rankingTitle}`

const ensureCuratedAuthor = async (
  ctx: MutationCtx,
  curated: CuratedOfficialRanking,
  now: number
): Promise<Doc<'users'>> =>
  await upsertSeedUser(ctx, {
    email: curatedAuthorEmail(curated),
    externalId: curatedAuthorExternalId(curated),
    displayName: curated.authorDisplayName,
    now,
  })

export const resetCuratedOfficialRankingImpl = internalMutation({
  args: {
    curatedIndex: v.number(),
    templateId: v.id('templates'),
  },
  returns: v.object({
    rankingsDeleted: v.number(),
    boardsDeleted: v.number(),
  }),
  handler: async (ctx, args): Promise<SeedResetResult> =>
  {
    const curated = requireCuratedRankingAt(args.curatedIndex)
    const target = targetDefinitionByKey(curated.targetKey)
    const user = await findUserByEmail(ctx, curatedAuthorEmail(curated))
    if (!user) return { rankingsDeleted: 0, boardsDeleted: 0 }

    return await deleteAuthorSeedPair(ctx, {
      user,
      templateId: args.templateId,
      boardExternalId: curatedBoardExternalId(curated, target),
      rankingTitle: curatedRankingTitle(curated),
    })
  },
})

export const seedCuratedOfficialRankingImpl = internalMutation({
  args: {
    curatedIndex: v.number(),
    templateId: v.id('templates'),
  },
  returns: v.object({
    targetKey: targetKeyValidator,
    templateSlug: v.string(),
    userEmail: v.string(),
    rankingSlug: v.string(),
    boardExternalId: v.string(),
    itemsRanked: v.number(),
    rankingsDeleted: v.number(),
  }),
  handler: async (ctx, args): Promise<SeedRankingResult> =>
  {
    const curated = requireCuratedRankingAt(args.curatedIndex)
    const target = targetDefinitionByKey(curated.targetKey)
    const template = await ctx.db.get(args.templateId)
    if (!template || !isPublishedTemplateRow(template))
    {
      throw new ConvexError({
        code: CONVEX_ERROR_CODES.notFound,
        message: `seed template missing or unpublished: ${target.title}`,
      })
    }

    const now = Date.now()
    const user = await ensureCuratedAuthor(ctx, curated, now)
    const deleted = await deleteAuthorSeedPair(ctx, {
      user,
      templateId: template._id,
      boardExternalId: curatedBoardExternalId(curated, target),
      rankingTitle: curatedRankingTitle(curated),
    })

    const templateItems = await loadSeedTemplateItems(ctx, template, target)

    const tiers = curated.tiers
    assertSeedRowsWithinLimit('curated tiers', tiers, MAX_SEED_ROW_TIERS)

    const rankedItems = mapItemsToCuratedTiers(curated, templateItems)
    // curated rankings sit just before the algorithmic seed feed in time so
    // they show up newest in 'recent' sorts w/o colliding w/ the profileIndex
    // ladder
    const createdAt = now - (curated.featuredRank + 1) * (HOUR_MS / 4)
    const rankingTitle = curatedRankingTitle(curated)
    const inserted = await insertSeedRanking(ctx, {
      user,
      template,
      target,
      authorKey: curatedAuthorKeyNs(curated.authorKey),
      rankedItems,
      tiers,
      rankingTitle,
      rankingDescription: curated.rankingDescription,
      createdAt,
      useCountAdjustedAt: now,
      ...(curated.criterionExternalId
        ? { criterionExternalId: curated.criterionExternalId }
        : {}),
      ...(curatedLaneSlug(curated)
        ? { laneSlug: curatedLaneSlug(curated) as string }
        : {}),
      viewCountSeedKey: `views:curated:${curated.authorKey}:${target.key}`,
    })

    return {
      targetKey: target.key,
      templateSlug: template.slug,
      userEmail: curatedAuthorEmail(curated),
      rankingSlug: inserted.rankingSlug,
      boardExternalId: inserted.boardExternalId,
      itemsRanked: inserted.itemsRanked,
      rankingsDeleted: deleted.rankingsDeleted,
    }
  },
})

export const queueSeedAggregateRecomputeImpl = internalMutation({
  args: { templateIds: v.array(v.id('templates')) },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> =>
  {
    const uniqueTemplateIds = [...new Set(args.templateIds)]
    const now = Date.now()
    let queued = 0
    for (const templateId of uniqueTemplateIds)
    {
      queued += await queueTemplateRankingAggregateRecomputesForActiveCriteria(
        ctx,
        templateId,
        now
      )
    }
    return queued
  },
})

export const seedSampleCommunityRankings = action({
  args: {
    seedSecret: v.string(),
    reset: v.optional(v.boolean()),
    userCount: v.optional(v.number()),
  },
  returns: seedCommunityRankingsResultValidator,
  handler: async (ctx, args): Promise<SeedCommunityRankingsResult> =>
  {
    requireSeedAuthorized(args.seedSecret)
    const userCount = normalizeUserCount(args.userCount)
    const targets: SeedTargetResolution[] = await ctx.runQuery(
      internal.marketplace.rankings.seed.resolveSeedTargetsImpl,
      {}
    )
    const resolvedTargetByKey = new Map(
      targets.map((target) => [target.key, target])
    )
    let rankingsDeleted = 0

    if (args.reset)
    {
      for (const target of targets)
      {
        for (
          let profileIndex = 0;
          profileIndex < SAMPLE_PROFILES.length;
          profileIndex++
        )
        {
          const resetResult: SeedResetResult = await ctx.runMutation(
            internal.marketplace.rankings.seed.resetSeedPairImpl,
            {
              targetKey: target.key,
              templateId: target.templateId,
              profileIndex,
            }
          )
          rankingsDeleted += resetResult.rankingsDeleted
          await pauseSeedWrites()
        }
      }
      // reset every favorites lane row first; otherwise leftover boards
      // from a prior run collide on byOwnerAndExternalId at re-insert
      for (const lane of SEED_EXTRA_LANES)
      {
        const target = resolvedTargetByKey.get(lane.targetKey)
        if (!target) continue
        for (
          let profileIndex = 0;
          profileIndex < SAMPLE_PROFILES.length;
          profileIndex++
        )
        {
          const resetResult: SeedResetResult = await ctx.runMutation(
            internal.marketplace.rankings.seed.resetExtraLaneSeedPairImpl,
            {
              laneKey: lane.laneKey,
              templateId: target.templateId,
              profileIndex,
            }
          )
          rankingsDeleted += resetResult.rankingsDeleted
          await pauseSeedWrites()
        }
      }
      for (
        let curatedIndex = 0;
        curatedIndex < ALL_CURATED_RANKINGS.length;
        curatedIndex++
      )
      {
        const curated = ALL_CURATED_RANKINGS[curatedIndex]
        const target = resolvedTargetByKey.get(curated.targetKey)
        if (!target) continue
        const resetResult: SeedResetResult = await ctx.runMutation(
          internal.marketplace.rankings.seed.resetCuratedOfficialRankingImpl,
          {
            curatedIndex,
            templateId: target.templateId,
          }
        )
        rankingsDeleted += resetResult.rankingsDeleted
        await pauseSeedWrites()
      }
    }

    // pre-build per-target lane breakdowns so the seed loops below can
    // tick stable per-criterion counters as sample + curated rankings land
    const buildLaneBreakdown = (
      target: SeedTargetResolution
    ): SeedLaneBreakdown[] =>
      target.criteria.map((criterion) => ({
        criterionExternalId: criterion.externalId,
        criterionName: criterion.name,
        sampleSeeded: 0,
        curatedSeeded: 0,
        curatedAuthors: [],
      }))
    const targetResults = new Map<TargetKey, SeedTargetResult>(
      targets.map((target) => [
        target.key,
        {
          key: target.key,
          title: target.title,
          slug: target.slug,
          itemCount: target.itemCount,
          rankingsSeeded: 0,
          rankingsDeleted: 0,
          laneBreakdown: buildLaneBreakdown(target),
        },
      ])
    )
    const primaryCriterionByTarget = new Map<TargetKey, string>(
      targets.map((target) => [
        target.key,
        target.criteria.find((c) => c.isPrimary)?.externalId ??
          target.criteria[0]?.externalId ??
          'default',
      ])
    )
    const recordTargetSeededRanking = (
      targetKey: TargetKey,
      deletedCount: number
    ): void =>
    {
      const result = targetResults.get(targetKey)
      if (!result) return
      result.rankingsSeeded += 1
      result.rankingsDeleted += deletedCount
    }
    const incrementLaneSample = (
      targetKey: TargetKey,
      criterionExternalId: string
    ): void =>
    {
      const result = targetResults.get(targetKey)
      if (!result) return
      const lane = result.laneBreakdown.find(
        (entry) => entry.criterionExternalId === criterionExternalId
      )
      if (lane) lane.sampleSeeded += 1
    }
    const incrementLaneCurated = (
      targetKey: TargetKey,
      criterionExternalId: string,
      authorDisplayName: string
    ): void =>
    {
      const result = targetResults.get(targetKey)
      if (!result) return
      const lane = result.laneBreakdown.find(
        (entry) => entry.criterionExternalId === criterionExternalId
      )
      if (!lane) return
      lane.curatedSeeded += 1
      lane.curatedAuthors.push(authorDisplayName)
    }
    const curatedRankingResults: SeedCuratedRankingResult[] = []

    // featured-badge skip set: any target whose curated lane includes a
    // primary-criterion list owns the algorithmic featured slots so we
    // don't double-feature the official list + a sample profile
    const targetsWithCuratedOfficials = new Set<TargetKey>(
      CURATED_OFFICIAL_RANKINGS.map((curated) => curated.targetKey)
    )

    for (const target of targets)
    {
      const seededSlugsByProfile = new Map<number, string>()
      const primaryCriterion =
        primaryCriterionByTarget.get(target.key) ?? 'default'
      for (let profileIndex = 0; profileIndex < userCount; profileIndex++)
      {
        const seeded: SeedRankingResult = await ctx.runMutation(
          internal.marketplace.rankings.seed.seedSampleRankingImpl,
          {
            targetKey: target.key,
            templateId: target.templateId,
            profileIndex,
          }
        )
        seededSlugsByProfile.set(profileIndex, seeded.rankingSlug)
        rankingsDeleted += seeded.rankingsDeleted
        recordTargetSeededRanking(target.key, seeded.rankingsDeleted)
        incrementLaneSample(target.key, primaryCriterion)
        await pauseSeedWrites()
      }
      // skip the algorithmic featured-profile badges for targets whose
      // official slot is owned by a curated tier list (e.g. SSBU)
      if (targetsWithCuratedOfficials.has(target.key)) continue
      for (const featured of FEATURED_PROFILE_BADGES)
      {
        const slug = seededSlugsByProfile.get(featured.profileIndex)
        if (!slug) continue
        await ctx.runMutation(
          internal.marketplace.rankings.mutations.markRankingFeaturedImpl,
          {
            slug,
            featuredRank: featured.featuredRank,
            featuredBadge: featured.featuredBadge,
          }
        )
      }
    }

    // favorites algorithmic seed pass — runs alongside competitive so each
    // template w/ multiple criteria has at least one ranking per lane
    let extraLaneSeeded = 0
    for (const lane of SEED_EXTRA_LANES)
    {
      const target = resolvedTargetByKey.get(lane.targetKey)
      if (!target) continue
      for (let profileIndex = 0; profileIndex < userCount; profileIndex++)
      {
        const seeded: SeedRankingResult = await ctx.runMutation(
          internal.marketplace.rankings.seed.seedExtraLaneSampleRankingImpl,
          {
            laneKey: lane.laneKey,
            templateId: target.templateId,
            profileIndex,
          }
        )
        rankingsDeleted += seeded.rankingsDeleted
        extraLaneSeeded += 1
        recordTargetSeededRanking(target.key, seeded.rankingsDeleted)
        incrementLaneSample(target.key, lane.criterionExternalId)
        await pauseSeedWrites()
      }
    }

    let curatedSeeded = 0
    for (
      let curatedIndex = 0;
      curatedIndex < ALL_CURATED_RANKINGS.length;
      curatedIndex++
    )
    {
      const curated = ALL_CURATED_RANKINGS[curatedIndex]
      const target = resolvedTargetByKey.get(curated.targetKey)
      if (!target) continue
      const seeded: SeedRankingResult = await ctx.runMutation(
        internal.marketplace.rankings.seed.seedCuratedOfficialRankingImpl,
        {
          curatedIndex,
          templateId: target.templateId,
        }
      )
      rankingsDeleted += seeded.rankingsDeleted
      curatedSeeded += 1
      recordTargetSeededRanking(curated.targetKey, seeded.rankingsDeleted)
      // resolve curated criterion the same way insertSeedRanking does so
      // breakdowns line up w/ what landed in the DB even when the curated
      // entry omits criterionExternalId (= primary criterion for that lane)
      const curatedCriterionExternalId =
        curated.criterionExternalId ??
        primaryCriterionByTarget.get(curated.targetKey) ??
        'default'
      incrementLaneCurated(
        curated.targetKey,
        curatedCriterionExternalId,
        curated.authorDisplayName
      )
      curatedRankingResults.push({
        targetKey: curated.targetKey,
        targetTitle: target.title,
        criterionExternalId: curatedCriterionExternalId,
        authorKey: curated.authorKey,
        authorDisplayName: curated.authorDisplayName,
        rankingTitle: curated.rankingTitle,
        rankingSlug: seeded.rankingSlug,
      })
      await ctx.runMutation(
        internal.marketplace.rankings.mutations.markRankingFeaturedImpl,
        {
          slug: seeded.rankingSlug,
          featuredRank: curated.featuredRank,
          featuredBadge: curated.featuredBadge,
        }
      )
      await pauseSeedWrites()
    }

    const aggregatesQueued: number = await ctx.runMutation(
      internal.marketplace.rankings.seed.queueSeedAggregateRecomputeImpl,
      { templateIds: targets.map((target) => target.templateId) }
    )
    const targetsOut = targets.map((target) => targetResults.get(target.key)!)
    const sampleRankingsSeeded = userCount * targets.length + extraLaneSeeded

    return {
      usersSeeded: userCount,
      sampleRankingsSeeded,
      curatedRankingsSeeded: curatedSeeded,
      rankingsSeeded: sampleRankingsSeeded + curatedSeeded,
      rankingsDeleted,
      aggregatesQueued,
      targets: targetsOut,
      curatedRankings: curatedRankingResults,
    }
  },
})
