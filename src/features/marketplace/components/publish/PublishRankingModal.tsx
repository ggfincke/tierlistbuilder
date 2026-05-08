// src/features/marketplace/components/publish/PublishRankingModal.tsx
// modal that publishes the active board's completed ranking — title +
// description + visibility, no cover (carries from the source template)

import { Loader2 } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'

import {
  MAX_RANKING_DESCRIPTION_LENGTH,
  MAX_RANKING_TITLE_LENGTH,
  RANKING_VISIBILITIES,
  type RankingVisibility,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { TextInput } from '~/shared/ui/TextInput'
import { createTypedSelectChangeHandler } from '~/shared/ui/selectChange'

import { usePublishRanking } from '~/features/marketplace/model/usePublishRanking'
import { useRankingPublishAvailability } from '~/features/marketplace/model/useRankingPublishAvailability'

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
  const availability = useRankingPublishAvailability(boardExternalId)
  const [title, setTitle] = useState(defaultTitle)
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<RankingVisibility>('public')
  const handleVisibilityChange = createTypedSelectChangeHandler(
    RANKING_VISIBILITIES,
    setVisibility
  )

  const trimmedTitle = title.trim()
  const titleTooLong = trimmedTitle.length > MAX_RANKING_TITLE_LENGTH
  const descriptionTooLong =
    description.trim().length > MAX_RANKING_DESCRIPTION_LENGTH
  const availabilityMessage =
    availability && !availability.canPublish ? availability.message : null

  const canSubmit =
    !isPending &&
    availability?.canPublish === true &&
    trimmedTitle.length > 0 &&
    !titleTooLong &&
    !descriptionTooLong

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) =>
  {
    event.preventDefault()
    if (!canSubmit) return

    const result = await run({
      boardExternalId,
      title: trimmedTitle,
      description: description.trim() ? description.trim() : null,
      visibility,
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
            {description.trim().length}/{MAX_RANKING_DESCRIPTION_LENGTH}
          </span>
        </div>
      </div>

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
