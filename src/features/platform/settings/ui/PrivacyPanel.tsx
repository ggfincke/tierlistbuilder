// src/features/platform/settings/ui/PrivacyPanel.tsx
// privacy controls for publish defaults, profile discovery, & future AI usage

import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'

import type { RankingVisibility } from '@tierlistbuilder/contracts/marketplace/ranking'
import type { TemplateVisibility } from '@tierlistbuilder/contracts/marketplace/template'
import type {
  PublicUserMe,
  UserPrivacySettings,
} from '@tierlistbuilder/contracts/platform/user'
import { useUpdatePrivacySettingsMutation } from '~/features/platform/auth/model/useAccountMutations'
import { formatError } from '~/shared/lib/errors'
import { joinClassNames } from '~/shared/lib/className'
import { toast } from '~/shared/notifications/useToastStore'
import { useRovingSelection } from '~/shared/selection/useRovingSelection'
import { Field, SetSection, ToggleRow } from './SettingsChrome'

interface SegmentedOption<TValue extends string>
{
  value: TValue
  label: string
  hint: string
}

interface SegmentedChoiceProps<TValue extends string>
{
  value: TValue
  options: readonly SegmentedOption<TValue>[]
  onChange: (value: TValue) => void
  disabled: boolean
  label: string
}

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
] as const satisfies readonly SegmentedOption<TemplateVisibility>[]

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
] as const satisfies readonly SegmentedOption<RankingVisibility>[]

const SegmentedChoice = <TValue extends string>({
  value,
  options,
  onChange,
  disabled,
  label,
}: SegmentedChoiceProps<TValue>) =>
{
  const keys = useMemo(() => options.map((option) => option.value), [options])
  // shared roving-tabindex nav (one tab stop, arrows move selection) w/
  // radiogroup/radio semantics; columns matches the visual grid as it grows
  const { groupProps, getItemProps, isActive } = useRovingSelection<TValue>({
    items: keys,
    activeKey: value,
    onSelect: onChange,
    kind: 'radio',
    groupLabel: label,
    columns: 2,
  })

  return (
    <div
      {...groupProps}
      className="grid grid-cols-2 gap-1 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] p-1"
    >
      {options.map((option, index) =>
      {
        const selected = isActive(option.value)
        return (
          <button
            key={option.value}
            {...getItemProps(option.value, index)}
            disabled={disabled}
            className={joinClassNames(
              'relative min-h-[64px] rounded-md px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
              selected
                ? 'bg-[var(--t-bg-surface)] text-[var(--t-text)] shadow-[0_0_0_1px_var(--t-accent)]'
                : 'text-[var(--t-text-muted)] hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)]'
            )}
          >
            {selected && (
              <span className="absolute right-2 top-2 text-[var(--t-accent)]">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            )}
            <span className="block text-[12px] font-bold leading-tight">
              {option.label}
            </span>
            <span className="mt-1 block text-[10px] leading-snug text-[var(--t-text-faint)]">
              {option.hint}
            </span>
          </button>
        )
      })}
    </div>
  )
}

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
