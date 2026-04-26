// src/features/marketplace/components/PublishModal.tsx
// modal that drives the publish-from-board flow — board picker, metadata
// fields, optional cover image, & rate-limit-aware submit

import { Loader2 } from 'lucide-react'
import { useId, useMemo, useState, type FormEvent } from 'react'

import {
  MAX_TEMPLATE_CREDIT_LINE_LENGTH,
  MAX_TEMPLATE_DESCRIPTION_LENGTH,
  MAX_TEMPLATE_TITLE_LENGTH,
  TEMPLATE_VISIBILITIES,
  type TemplateCategory,
  type TemplateVisibility,
} from '@tierlistbuilder/contracts/marketplace/template'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { TextInput } from '~/shared/ui/TextInput'

import { CATEGORY_LIST } from '~/features/marketplace/model/categories'
import { usePublishTemplate } from '~/features/marketplace/model/usePublishTemplate'
import {
  useMyPublishableBoards,
  type PublishableBoard,
} from '~/features/marketplace/model/useMyPublishableBoards'
import { BoardPicker } from './BoardPicker'
import { CoverImageInput } from './CoverImageInput'
import { TagsInput } from './TagsInput'

interface PublishModalProps
{
  open: boolean
  onClose: () => void
}

const VISIBILITY_LABELS: Record<TemplateVisibility, string> = {
  public: 'Public — listed in the gallery',
  unlisted: 'Unlisted — direct link only',
}

interface PublishFormProps
{
  onClose: () => void
}

// holds all form state; mounted only while the modal is open so reopening
// the modal restarts w/ a clean draft
const PublishForm = ({ onClose }: PublishFormProps) =>
{
  const titleFieldId = useId()
  const descFieldId = useId()
  const categoryFieldId = useId()
  const visibilityFieldId = useId()
  const creditFieldId = useId()

  const { boards, hasUnsyncedBoards } = useMyPublishableBoards()
  const { run, isPending, error } = usePublishTemplate()

  const [boardOverride, setBoardOverride] = useState<PublishableBoard | null>(
    null
  )
  const [titleOverride, setTitleOverride] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<TemplateCategory>('other')
  const [tags, setTags] = useState<string[]>([])
  const [visibility, setVisibility] = useState<TemplateVisibility>('public')
  const [creditLine, setCreditLine] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverError, setCoverError] = useState<string | null>(null)

  const board = boardOverride ?? boards[0] ?? null
  const title = titleOverride ?? (board ? board.title : '')

  const handleBoardChange = (next: PublishableBoard) =>
  {
    setBoardOverride(next)
    if (titleOverride === null)
    {
      setTitleOverride(null)
    }
  }

  const trimmedTitle = title.trim()
  const titleTooLong = trimmedTitle.length > MAX_TEMPLATE_TITLE_LENGTH
  const descriptionTooLong =
    description.trim().length > MAX_TEMPLATE_DESCRIPTION_LENGTH
  const creditTooLong =
    creditLine.trim().length > MAX_TEMPLATE_CREDIT_LINE_LENGTH

  const canSubmit = useMemo(
    () =>
      !isPending &&
      !!board &&
      trimmedTitle.length > 0 &&
      !titleTooLong &&
      !descriptionTooLong &&
      !creditTooLong &&
      !coverError,
    [
      board,
      trimmedTitle,
      titleTooLong,
      descriptionTooLong,
      creditTooLong,
      coverError,
      isPending,
    ]
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) =>
  {
    event.preventDefault()
    if (!canSubmit || !board) return

    const result = await run({
      boardExternalId: board.boardExternalId,
      title: trimmedTitle,
      description: description.trim() ? description.trim() : null,
      category,
      tags,
      visibility,
      creditLine: creditLine.trim() ? creditLine.trim() : null,
      coverFile,
      clearCover: coverFile === null,
    })

    if (result)
    {
      onClose()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-5">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--t-text-faint)]">
          Source board
        </h3>
        <BoardPicker
          boards={boards}
          hasUnsyncedBoards={hasUnsyncedBoards}
          selected={board}
          onChange={handleBoardChange}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--t-text-faint)]">
          Template details
        </h3>

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
            onChange={(e) => setTitleOverride(e.target.value)}
            maxLength={MAX_TEMPLATE_TITLE_LENGTH + 1}
            placeholder="Every Pokémon, ranked"
            className="mt-1 w-full"
            disabled={isPending}
            required
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--t-text-faint)]">
            <span>What it'll show up as in the gallery</span>
            <span
              className={
                titleTooLong ? 'text-[var(--t-destructive-hover)]' : ''
              }
            >
              {trimmedTitle.length}/{MAX_TEMPLATE_TITLE_LENGTH}
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
            maxLength={MAX_TEMPLATE_DESCRIPTION_LENGTH + 1}
            rows={3}
            disabled={isPending}
            placeholder="Optional — a short blurb shown on the detail page."
            className="focus-custom mt-1 w-full rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-3 py-2 text-sm text-[var(--t-text)] placeholder:text-[var(--t-text-faint)] focus:border-[var(--t-border-hover)]"
          />
          <div className="mt-1 flex justify-end text-[10px] text-[var(--t-text-faint)]">
            <span
              className={
                descriptionTooLong ? 'text-[var(--t-destructive-hover)]' : ''
              }
            >
              {description.trim().length}/{MAX_TEMPLATE_DESCRIPTION_LENGTH}
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor={categoryFieldId}
              className="block text-xs font-medium text-[var(--t-text-secondary)]"
            >
              Category
            </label>
            <select
              id={categoryFieldId}
              value={category}
              onChange={(e) => setCategory(e.target.value as TemplateCategory)}
              disabled={isPending}
              className="focus-custom mt-1 w-full rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-3 py-2 text-sm text-[var(--t-text)] focus:border-[var(--t-border-hover)]"
            >
              {CATEGORY_LIST.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
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
              onChange={(e) =>
                setVisibility(e.target.value as TemplateVisibility)
              }
              disabled={isPending}
              className="focus-custom mt-1 w-full rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-3 py-2 text-sm text-[var(--t-text)] focus:border-[var(--t-border-hover)]"
            >
              {TEMPLATE_VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {VISIBILITY_LABELS[v]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <span className="block text-xs font-medium text-[var(--t-text-secondary)]">
            Tags
          </span>
          <div className="mt-1">
            <TagsInput value={tags} onChange={setTags} />
          </div>
        </div>

        <div>
          <label
            htmlFor={creditFieldId}
            className="block text-xs font-medium text-[var(--t-text-secondary)]"
          >
            Credit line
          </label>
          <TextInput
            id={creditFieldId}
            size="md"
            value={creditLine}
            onChange={(e) => setCreditLine(e.target.value)}
            maxLength={MAX_TEMPLATE_CREDIT_LINE_LENGTH + 1}
            placeholder="Optional — e.g. 'Item images by The Pokémon Company.'"
            className="mt-1 w-full"
            disabled={isPending}
          />
          <div className="mt-1 flex justify-end text-[10px] text-[var(--t-text-faint)]">
            <span
              className={
                creditTooLong ? 'text-[var(--t-destructive-hover)]' : ''
              }
            >
              {creditLine.trim().length}/{MAX_TEMPLATE_CREDIT_LINE_LENGTH}
            </span>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--t-text-faint)]">
          Cover artwork
        </h3>
        <CoverImageInput
          file={coverFile}
          onChange={setCoverFile}
          onValidationError={setCoverError}
        />
        {coverError && (
          <p role="alert" className="text-xs text-[var(--t-destructive-hover)]">
            {coverError}
          </p>
        )}
      </section>

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
            'Publish template'
          )}
        </PrimaryButton>
      </div>
    </form>
  )
}

export const PublishModal = ({ open, onClose }: PublishModalProps) =>
{
  const titleId = useId()

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="w-full max-w-lg p-5"
    >
      <ModalHeader titleId={titleId}>Publish as template</ModalHeader>
      <p className="mt-1 text-sm text-[var(--t-text-muted)]">
        Strip the rankings & share your item set so others can fork it into
        their own tier list.
      </p>

      <PublishForm onClose={onClose} />
    </BaseModal>
  )
}
