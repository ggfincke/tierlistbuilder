// src/features/social/settings/ui/PrivacyPanel.tsx
// privacy controls for publish defaults, profile discovery, & future AI usage

import { useState } from 'react'

import type { RankingVisibility } from '@tierlistbuilder/contracts/marketplace/ranking'
import type { TemplateVisibility } from '@tierlistbuilder/contracts/marketplace/template'
import type {
  PublicUserMe,
  UserPrivacySettings,
} from '@tierlistbuilder/contracts/platform/user'
import { useUpdatePrivacySettingsMutation } from '~/features/platform/auth/model/useAccountMutations'
import { formatError } from '~/shared/lib/errors'
import { toast } from '~/shared/notifications/useToastStore'
import {
  SegmentedChoice,
  type SegmentedChoiceOption,
} from '~/shared/ui/settings/SegmentedChoice'
import {
  Field,
  SetSection,
  ToggleRow,
} from '~/shared/ui/settings/SettingsChrome'

const TEMPLATE_VISIBILITY_OPTIONS = [
  {
    value: 'public',
    label: 'Public',
    hint: 'Listed in the gallery.',
  },
  {
    value: 'unlisted',
    label: 'Unlisted',
    hint: 'Visible to anyone with the link.',
  },
] as const satisfies readonly SegmentedChoiceOption<TemplateVisibility>[]

const RANKING_VISIBILITY_OPTIONS = [
  {
    value: 'public',
    label: 'Public',
    hint: 'Listed under the source template.',
  },
  {
    value: 'unlisted',
    label: 'Unlisted',
    hint: 'Visible to anyone with the link.',
  },
] as const satisfies readonly SegmentedChoiceOption<RankingVisibility>[]

interface PrivacyPanelProps
{
  user: PublicUserMe
}

export const PrivacyPanel = ({ user }: PrivacyPanelProps) =>
{
  const updatePrivacy = useUpdatePrivacySettingsMutation()
  const [savingKey, setSavingKey] = useState<keyof UserPrivacySettings | null>(
    null
  )
  // server is the single source of truth; the optimistic update flips the
  // toggle instantly & rolls back on error, so there's no local mirror to drift
  const settings = user.privacy

  const updateSetting = async <TKey extends keyof UserPrivacySettings>(
    key: TKey,
    value: UserPrivacySettings[TKey]
  ) =>
  {
    if (savingKey !== null || settings[key] === value) return

    setSavingKey(key)
    try
    {
      await updatePrivacy({ [key]: value })
      toast('Privacy settings updated', 'success')
    }
    catch (error)
    {
      toast(formatError(error, 'Failed to update privacy settings'), 'error')
    }
    finally
    {
      setSavingKey(null)
    }
  }

  const disabled = savingKey !== null

  return (
    <SetSection
      eyebrow="Privacy"
      title="Visibility defaults"
      subtitle="Used when publishing new templates and rankings."
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Template publish default">
          <SegmentedChoice
            label="Template publish default"
            value={settings.defaultTemplateVisibility}
            options={TEMPLATE_VISIBILITY_OPTIONS}
            disabled={disabled}
            onChange={(value) =>
            {
              void updateSetting('defaultTemplateVisibility', value)
            }}
          />
        </Field>
        <Field label="Ranking publish default">
          <SegmentedChoice
            label="Ranking publish default"
            value={settings.defaultRankingVisibility}
            options={RANKING_VISIBILITY_OPTIONS}
            disabled={disabled}
            onChange={(value) =>
            {
              void updateSetting('defaultRankingVisibility', value)
            }}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-1 border-t border-[var(--t-border)] pt-3 md:grid-cols-3">
        <ToggleRow
          label="Members directory"
          hint="Show your profile in future member browsing."
          checked={settings.showInMembersDirectory}
          disabled={disabled}
          onChange={(value) =>
          {
            void updateSetting('showInMembersDirectory', value)
          }}
        />
        <ToggleRow
          label="Hide from search"
          hint="Keep your profile out of future search indexes."
          checked={settings.hideProfileFromSearch}
          disabled={disabled}
          onChange={(value) =>
          {
            void updateSetting('hideProfileFromSearch', value)
          }}
        />
        <ToggleRow
          label="Allow AI training"
          hint="Opt in before public content is used for future training jobs."
          checked={settings.allowAiTraining}
          disabled={disabled}
          onChange={(value) =>
          {
            void updateSetting('allowAiTraining', value)
          }}
        />
      </div>
    </SetSection>
  )
}
