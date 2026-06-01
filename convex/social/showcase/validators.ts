// convex/social/showcase/validators.ts
// profile-showcase runtime validators & contract drift guards

import { v, type Infer } from 'convex/values'
import {
  type ProfileShowcaseEditData,
  type ProfileShowcaseSaveInput,
  type PublicProfileShowcase,
} from '@tierlistbuilder/contracts/social/showcase'
import {
  boardAutoPlateSettingsValidator,
  tierColorSpecValidator,
} from '../../lib/validators/common'
import {
  marketplaceItemRenderFields,
  templateMediaRefValidator,
} from '../../lib/validators/marketplace'

const showcaseTierValidator = v.object({
  externalId: v.string(),
  name: v.string(),
  description: v.union(v.string(), v.null()),
  colorSpec: tierColorSpecValidator,
  rowColorSpec: v.union(tierColorSpecValidator, v.null()),
  order: v.number(),
})

const showcaseMiniItemValidator = v.object(marketplaceItemRenderFields)

const showcaseMiniTierValidator = v.object({
  name: v.string(),
  colorSpec: tierColorSpecValidator,
  rowColorSpec: v.union(tierColorSpecValidator, v.null()),
  items: v.array(showcaseMiniItemValidator),
})

// exported so the library row validator can reuse the same mini shape
export const showcaseMiniSnapshotValidator = v.object({
  tiers: v.array(showcaseMiniTierValidator),
  itemAspectRatio: v.union(v.number(), v.null()),
  autoPlate: v.union(boardAutoPlateSettingsValidator, v.null()),
})

const showcaseRankingTileValidator = v.object({
  boardExternalId: v.string(),
  rankingSlug: v.string(),
  title: v.string(),
  cover: v.union(templateMediaRefValidator, v.null()),
  mini: v.union(showcaseMiniSnapshotValidator, v.null()),
})

const showcasePlacedTileValidator = v.object({
  ...showcaseRankingTileValidator.fields,
  tierExternalId: v.string(),
  order: v.number(),
})

export const profileShowcaseEditDataValidator = v.object({
  tiers: v.array(showcaseTierValidator),
  placed: v.array(showcasePlacedTileValidator),
  unranked: v.array(showcaseRankingTileValidator),
})

const publicProfileShowcaseTierValidator = v.object({
  ...showcaseTierValidator.fields,
  tiles: v.array(showcaseRankingTileValidator),
})

export const publicProfileShowcaseValidator = v.object({
  tiers: v.array(publicProfileShowcaseTierValidator),
  placedCount: v.number(),
})

const showcasePlacementInputValidator = v.object({
  tierExternalId: v.string(),
  boardExternalId: v.string(),
  order: v.number(),
})

export const profileShowcaseSaveInputValidator = v.object({
  tiers: v.array(showcaseTierValidator),
  placements: v.array(showcasePlacementInputValidator),
})

// contract types & runtime validators must stay identical
type _EditDataMatches =
  ProfileShowcaseEditData extends Infer<typeof profileShowcaseEditDataValidator>
    ? Infer<
        typeof profileShowcaseEditDataValidator
      > extends ProfileShowcaseEditData
      ? true
      : false
    : false
const _editDataCheck: _EditDataMatches = true
void _editDataCheck

type _PublicMatches =
  PublicProfileShowcase extends Infer<typeof publicProfileShowcaseValidator>
    ? Infer<typeof publicProfileShowcaseValidator> extends PublicProfileShowcase
      ? true
      : false
    : false
const _publicCheck: _PublicMatches = true
void _publicCheck

type _SaveMatches =
  ProfileShowcaseSaveInput extends Infer<
    typeof profileShowcaseSaveInputValidator
  >
    ? Infer<
        typeof profileShowcaseSaveInputValidator
      > extends ProfileShowcaseSaveInput
      ? true
      : false
    : false
const _saveCheck: _SaveMatches = true
void _saveCheck
