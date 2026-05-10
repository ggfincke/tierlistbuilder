// src/features/marketplace/components/publish/PublishRankingModal.tsx
// modal that publishes the active board: title + description + visibility +
// criterion (when the template has multiple curated criteria)

import { Clock, Loader2, Tag } from 'lucide-react'
import { useId, useMemo, useState, type FormEvent } from 'react'

import {
  MAX_RANKING_DESCRIPTION_LENGTH,
  MAX_RANKING_TITLE_LENGTH,
  RANKING_VISIBILITIES,
  type RankingVisibility,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import type { MarketplaceTemplateCriterion } from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { TextInput } from '~/shared/ui/TextInput'
import { createTypedSelectChangeHandler } from '~/shared/ui/selectChange'

import { usePublishRanking } from '~/features/marketplace/model/usePublishRanking'
import { useRankingPublishAvailability } from '~/features/marketplace/model/useRankingPublishAvailability'
import { pickInitialCriterionExternalId } from '~/features/marketplace/model/criterionSelection'

interface PublishRankingModalProps
{
  open: boolean
  onClose: () => void
  boardExternalId: string
  defaultTitle: string
}

const VISIBILITY_LABELS: Record<RankingVisibility, string> = {
  public: 'Public — listed under the source template',
  unlisted: 'Unlisted — direct link only',
}

interface PublishRankingFormProps
{
  onClose: () => void
  boardExternalId: string
  defaultTitle: string
}

interface CriterionPickerProps
{
  criteria: readonly MarketplaceTemplateCriterion[]
  selectedExternalId: string | null
  onChange: (externalId: string) => void
  alreadyPublishedSet: ReadonlySet<string>
  disabled: boolean
}

const CriterionPicker = ({
  criteria,
  selectedExternalId,
  onChange,
  alreadyPublishedSet,
  disabled,
}: CriterionPickerProps) =>
{
  if (criteria.length === 0) return null
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium text-[var(--t-text-secondary)]">
          Which criterion does this ranking answer?
        </p>
        <span className="font-mono text-[10px] text-[var(--t-text-faint)]">
          Required · pick exactly one
        </span>
      </div>
      <ul
        role="radiogroup"
        aria-label="Criterion"
        className="mt-2 grid gap-1.5"
      >
        {criteria.map((criterion) =>
        {
          const selected = criterion.externalId === selectedExternalId
          const updates = alreadyPublishedSet.has(criterion.externalId)
          const shortName = criterion.shortName ?? criterion.name
          return (
            <li key={criterion.externalId}>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                  selected
                    ? 'border-[var(--t-accent)] bg-[var(--t-bg-surface)] ring-1 ring-[var(--t-accent)]'
                    : 'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)]'
                } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name="ranking-criterion"
                  value={criterion.externalId}
                  checked={selected}
                  onChange={() => onChange(criterion.externalId)}
                  disabled={disabled}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    selected
                      ? 'border-[var(--t-accent)]'
                      : 'border-[var(--t-border-hover)]'
                  }`}
                >
                  {selected && (
                    <span className="h-2 w-2 rounded-full bg-[var(--t-accent)]" />
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--t-border)] bg-[var(--t-bg-sunken)] text-[var(--t-text-secondary)]"
                >
                  <Tag className="h-3 w-3" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--t-text)]">
                    {criterion.name}
                    {criterion.isPrimary && (
                      <span className="rounded bg-[rgb(var(--t-overlay)/0.06)] px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
                        Primary
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-[var(--t-text-muted)]">
                    {criterion.prompt}
                  </span>
                  {criterion.shortName &&
                    criterion.shortName !== criterion.name && (
                      <span className="block font-mono text-[10px] text-[var(--t-text-faint)]">
                        {shortName}
                      </span>
                    )}
                </span>
                {updates && (
                  <span
                    className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--t-bg-active)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--t-text-secondary)]"
                    title="You already have a public ranking in this lane — publishing again will replace your previous public contribution."
                  >
                    <Clock className="h-2.5 w-2.5" strokeWidth={2.4} />
                    Updates yours
                  </span>
                )}
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const PublishRankingForm = ({
  onClose,
  boardExternalId,
  defaultTitle,
}: PublishRankingFormProps) =>
{
  const titleFieldId = useId()
  const descFieldId = useId()
  const visibilityFieldId = useId()

  const { run, isPending, error } = usePublishRanking()
  // explicit user pick (null until the user clicks). the active criterion is
  // derived during render — explicit pick first, then the server-resolved
  // primary — so we never call setState inside an effect to sync the two
  const [explicitCriterionExternalId, setExplicitCriterionExternalId] =
    useState<string | null>(null)
  const availability = useRankingPublishAvailability(
    boardExternalId,
    explicitCriterionExternalId
  )
  const sourceCriteria = useMemo(
    () => availability?.sourceTemplateCriteria ?? [],
    [availability?.sourceTemplateCriteria]
  )
  const userPublishedCriteriaSet = useMemo(
    () => new Set(availability?.userPublishedCriterionExternalIds ?? []),
    [availability?.userPublishedCriterionExternalIds]
  )
  const [title, setTitle] = useState(defaultTitle)
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<RankingVisibility>('public')
  const handleVisibilityChange = createTypedSelectChangeHandler(
    RANKING_VISIBILITIES,
    setVisibility
  )

  const fallbackCriterionExternalId = pickInitialCriterionExternalId(
    sourceCriteria,
    availability?.preferredCriterionExternalId
  )
  const criterionExternalId =
    explicitCriterionExternalId ?? fallbackCriterionExternalId
  const selectedCriterion =
    sourceCriteria.find((c) => c.externalId === criterionExternalId) ?? null
  const supersedesPublic =
    visibility === 'public' &&
    selectedCriterion !== null &&
    userPublishedCriteriaSet.has(selectedCriterion.externalId)

  const trimmedTitle = title.trim()
  const trimmedDescription = description.trim()
  const titleTooLong = trimmedTitle.length > MAX_RANKING_TITLE_LENGTH
  const descriptionTooLong =
    trimmedDescription.length > MAX_RANKING_DESCRIPTION_LENGTH
  const availabilityMessage =
    availability && !availability.canPublish ? availability.message : null

  const showCriterionPicker = sourceCriteria.length > 1

  const canSubmit =
    !isPending &&
    availability?.canPublish === true &&
    trimmedTitle.length > 0 &&
    !titleTooLong &&
    !descriptionTooLong &&
    (!showCriterionPicker || criterionExternalId !== null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) =>
  {
    event.preventDefault()
    if (!canSubmit) return

    const result = await run({
      boardExternalId,
      title: trimmedTitle,
      description: trimmedDescription ? trimmedDescription : null,
      visibility,
      ...(criterionExternalId
        ? { criterionExternalId: criterionExternalId }
        : {}),
    })
    if (result)
    {
      onClose()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-4">
      <div>
        <label
          htmlFor={titleFieldId}
          className="block text-xs font-medium text-[var(--t-text-secondary)]"
        >
          Title
        </label>
        <TextInput
          id={titleFieldId}
          size="md"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_RANKING_TITLE_LENGTH + 1}
          placeholder="My personal Pokémon ranking"
          className="mt-1 w-full"
          disabled={isPending}
          required
        />
        <div className="mt-1 flex justify-end text-[10px] text-[var(--t-text-faint)]">
          <span
            className={titleTooLong ? 'text-[var(--t-destructive-hover)]' : ''}
          >
            {trimmedTitle.length}/{MAX_RANKING_TITLE_LENGTH}
          </span>
        </div>
      </div>

      <div>
        <label
          htmlFor={descFieldId}
          className="block text-xs font-medium text-[var(--t-text-secondary)]"
        >
          Description
        </label>
        <textarea
          id={descFieldId}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={MAX_RANKING_DESCRIPTION_LENGTH + 1}
          rows={3}
          disabled={isPending}
          placeholder="Optional — share your reasoning or hot takes."
          className="focus-custom mt-1 w-full rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-3 py-2 text-sm text-[var(--t-text)] placeholder:text-[var(--t-text-faint)] focus:border-[var(--t-border-hover)]"
        />
        <div className="mt-1 flex justify-end text-[10px] text-[var(--t-text-faint)]">
          <span
            className={
              descriptionTooLong ? 'text-[var(--t-destructive-hover)]' : ''
            }
          >
            {trimmedDescription.length}/{MAX_RANKING_DESCRIPTION_LENGTH}
          </span>
        </div>
      </div>

      {showCriterionPicker && (
        <CriterionPicker
          criteria={sourceCriteria}
          selectedExternalId={criterionExternalId}
          onChange={setExplicitCriterionExternalId}
          alreadyPublishedSet={userPublishedCriteriaSet}
          disabled={isPending}
        />
      )}

      {showCriterionPicker && selectedCriterion && (
        <div className="rounded-md border border-[var(--t-border)] bg-[var(--t-bg-sunken)] px-3 py-2.5">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
            Will be filed under
          </p>
          <p className="mt-1 text-[13px] text-[var(--t-text)]">
            <span className="font-semibold">
              {availability?.sourceTemplateTitle ?? 'This template'}
            </span>
            <span className="mx-1.5 text-[var(--t-text-faint)]">/</span>
            <span className="font-semibold text-[var(--t-accent)]">
              {selectedCriterion.name}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--t-text-muted)]">
            Your ranking will be aggregated only with other rankings answering “
            {selectedCriterion.shortName ?? selectedCriterion.name}”. Other
            criteria’s consensus is unaffected.
          </p>
          {supersedesPublic && (
            <p className="mt-1.5 inline-flex items-center gap-1 rounded bg-[var(--t-bg-active)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--t-text-secondary)]">
              <Clock className="h-2.5 w-2.5" strokeWidth={2.4} />
              Replaces your previous public ranking in this lane
            </p>
          )}
        </div>
      )}

      <div>
        <label
          htmlFor={visibilityFieldId}
          className="block text-xs font-medium text-[var(--t-text-secondary)]"
        >
          Visibility
        </label>
        <select
          id={visibilityFieldId}
          value={visibility}
          onChange={handleVisibilityChange}
          disabled={isPending}
          className="focus-custom mt-1 w-full rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-3 py-2 text-sm text-[var(--t-text)] focus:border-[var(--t-border-hover)]"
        >
          {RANKING_VISIBILITIES.map((v) => (
            <option key={v} value={v}>
              {VISIBILITY_LABELS[v]}
            </option>
          ))}
        </select>
      </div>

      {availabilityMessage && (
        <p role="status" className="text-xs text-[var(--t-text-muted)]">
          {availabilityMessage}
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-[var(--t-destructive-hover)]">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-[var(--t-border)] pt-4">
        <SecondaryButton type="button" disabled={isPending} onClick={onClose}>
          Cancel
        </SecondaryButton>
        <PrimaryButton type="submit" size="md" disabled={!canSubmit}>
          {isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              Publishing…
            </>
          ) : (
            'Publish ranking'
          )}
        </PrimaryButton>
      </div>
    </form>
  )
}

export const PublishRankingModal = ({
  open,
  onClose,
  boardExternalId,
  defaultTitle,
}: PublishRankingModalProps) =>
{
  const titleId = useId()

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="w-full max-w-lg p-5"
    >
      <ModalHeader titleId={titleId}>Publish ranking</ModalHeader>
      <p className="mt-1 text-sm text-[var(--t-text-muted)]">
        Share your finished tier list. Only completed template-backed boards can
        be published.
      </p>

      <PublishRankingForm
        onClose={onClose}
        boardExternalId={boardExternalId}
        defaultTitle={defaultTitle}
      />
    </BaseModal>
  )
}
