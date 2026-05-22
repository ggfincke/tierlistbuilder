// src/features/marketplace/ui/publish/publishVisibilityOptions.ts
// shared visibility-select labels for template & ranking publish modals

import type { LabeledSelectOption } from './PublishFormFields'

const UNLISTED_VISIBILITY_OPTION_LABEL = 'Unlisted — direct link only'

export const buildVisibilityOptions = <
  TVisibility extends 'public' | 'unlisted',
>(
  values: readonly TVisibility[],
  publicLabel: string
): LabeledSelectOption<TVisibility>[] =>
  values.map((value) => ({
    value,
    label: value === 'public' ? publicLabel : UNLISTED_VISIBILITY_OPTION_LABEL,
  }))
