// src/features/marketplace/ui/publish/PublishModal.tsx
// modal that drives publish-from-board OR edit-existing flows — board picker,
// metadata fields, optional cover image, & rate-limit-aware submit

import { LayoutGrid, Loader2 } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'

import {
  MAX_TEMPLATE_CREDIT_LINE_LENGTH,
  MAX_TEMPLATE_DESCRIPTION_LENGTH,
  MAX_TEMPLATE_TITLE_LENGTH,
  TEMPLATE_VISIBILITIES,
  type TemplateVisibility,
} from '@tierlistbuilder/contracts/marketplace/template'
import {
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
} from '@tierlistbuilder/contracts/marketplace/category'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { DialogActions } from '~/shared/overlay/DialogActions'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { TextInput } from '~/shared/ui/TextInput'
import { createTypedSelectChangeHandler } from '~/shared/ui/selectChange'

import { CATEGORY_LIST } from '~/features/marketplace/model/categories'
import { usePublishTemplate } from '~/features/marketplace/model/publish/usePublishTemplate'
import { useUpdateTemplate } from '~/features/marketplace/model/publish/useUpdateTemplate'
import {
  usePublishableBoards,
  type PublishableBoard,
} from '~/features/workspace/boards/model/usePublishableBoards'
import { BoardPicker } from './BoardPicker'
import {
  CoverImageInput,
  type CoverImageInputValue,
} from '../cover/CoverImageInput'
import {
  createInitialPublishBoardSelection,
  resolveSelectedPublishBoard,
  type PublishBoardSelection,
} from './publishBoardSelection'
import { TagsInput } from './TagsInput'

export interface PublishModalEditInitialValues
{
  slug: string
  title: string
  description: string
  category: TemplateCategory
  tags: string[]
  visibility: TemplateVisibility
  creditLine: string
  hasCoverMedia: boolean
}

interface PublishModalProps
{
  open: boolean
  onClose: () => void
  onPublished?: () => void
  // when present, the modal switches to edit mode against this slug; the form
  // is prefilled from initialValues & calls updateMyTemplateMeta on submit
  edit?: PublishModalEditInitialValues
  // pre-select this board id in the picker (publish mode only). lets workspace
  // entry points default to the active board instead of the most-recent one
  initialBoardExternalId?: string | null
}

const VISIBILITY_LABELS: Record<TemplateVisibility, string> = {
  public: 'Public — listed in the gallery',
  unlisted: 'Unlisted — direct link only',
}

interface PublishFormProps
{
  onClose: () => void
  onPublished?: () => void
  edit?: PublishModalEditInitialValues
  initialBoardExternalId?: string | null
}

// holds all form state; mounted only while the modal is open so reopening
// the modal restarts w/ a clean draft
const PublishForm = ({
  onClose,
  onPublished,
  edit,
  initialBoardExternalId,
}: PublishFormProps) =>
{
  const titleFieldId = useId()
  const descFieldId = useId()
  const categoryFieldId = useId()
  const visibilityFieldId = useId()
  const creditFieldId = useId()
  const isEdit = !!edit

  const { boards, hasEmptyBoards } = usePublishableBoards()
  const publishAction = usePublishTemplate()
  const updateAction = useUpdateTemplate()

  // preserve an unmatched workspace source as "no board" so publish never
  // silently selects a different local board
  const [boardSelection, setBoardSelection] = useState<PublishBoardSelection>(
    () => createInitialPublishBoardSelection({ isEdit, initialBoardExternalId })
  )
  const [titleOverride, setTitleOverride] = useState<string | null>(
    edit?.title ?? null
  )
  const [description, setDescription] = useState(edit?.description ?? '')
  // default to the most common gallery category so the publish flow lands in
  // a discoverable bucket; 'other' is a fallback, not a starting point
  const [category, setCategory] = useState<TemplateCategory>(
    edit?.category ?? 'gaming'
  )
  const [tags, setTags] = useState<string[]>(edit?.tags ?? [])
  const [visibility, setVisibility] = useState<TemplateVisibility>(
    edit?.visibility ?? 'public'
  )
  const [creditLine, setCreditLine] = useState(edit?.creditLine ?? '')
  const [coverValue, setCoverValue] = useState<CoverImageInputValue | null>(
    null
  )
  const [removeCover, setRemoveCover] = useState(false)
  const [coverError, setCoverError] = useState<string | null>(null)
  const handleCategoryChange = createTypedSelectChangeHandler(
    TEMPLATE_CATEGORIES,
    setCategory
  )
  const handleVisibilityChange = createTypedSelectChangeHandler(
    TEMPLATE_VISIBILITIES,
    setVisibility
  )

  const board = isEdit
    ? null
    : resolveSelectedPublishBoard(boards, boardSelection)
  const title = titleOverride ?? (board ? board.title : '')

  const isPending = isEdit ? updateAction.isPending : publishAction.isPending
  const error = isEdit ? updateAction.error : publishAction.error

  // when a different board is picked, drop any title override so the new
  // board's title becomes the default. only clears the override if it was
  // user-set; the default-derived case is a no-op since title flows from board
  const handleBoardChange = (next: PublishableBoard) =>
  {
    setBoardSelection({
      kind: 'explicit',
      boardExternalId: next.boardExternalId,
    })
    setTitleOverride(null)
  }

  const handleCoverChange = (next: CoverImageInputValue | null) =>
  {
    setCoverValue(next)
    if (next) setRemoveCover(false)
  }

  const trimmedTitle = title.trim()
  const trimmedDescription = description.trim()
  const trimmedCreditLine = creditLine.trim()
  const titleTooLong = trimmedTitle.length > MAX_TEMPLATE_TITLE_LENGTH
  const descriptionTooLong =
    trimmedDescription.length > MAX_TEMPLATE_DESCRIPTION_LENGTH
  const creditTooLong =
    trimmedCreditLine.length > MAX_TEMPLATE_CREDIT_LINE_LENGTH

  const canSubmit =
    !isPending &&
    (isEdit || !!board) &&
    trimmedTitle.length > 0 &&
    !titleTooLong &&
    !descriptionTooLong &&
    !creditTooLong &&
    !coverError

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) =>
  {
    event.preventDefault()
    if (!canSubmit) return

    const coverFile = coverValue?.file ?? null
    const coverFraming = coverValue ? coverValue.framing : undefined
    if (isEdit)
    {
      const result = await updateAction.run({
        slug: edit.slug,
        title: trimmedTitle,
        description: trimmedDescription ? trimmedDescription : null,
        category,
        tags,
        visibility,
        creditLine: trimmedCreditLine ? trimmedCreditLine : null,
        coverFile,
        removeCover,
        coverFraming,
      })
      if (result)
      {
        onPublished?.()
        onClose()
      }
      return
    }

    if (!board) return
    const result = await publishAction.run({
      boardExternalId: board.boardExternalId,
      title: trimmedTitle,
      description: trimmedDescription ? trimmedDescription : null,
      category,
      tags,
      visibility,
      creditLine: trimmedCreditLine ? trimmedCreditLine : null,
      coverFile,
      coverFraming: coverFraming ?? null,
    })

    if (result)
    {
      onPublished?.()
      onClose()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        {!isEdit && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--t-text-faint)]">
              Source board
            </h3>
            <BoardPicker
              boards={boards}
              hasEmptyBoards={hasEmptyBoards}
              selected={board}
              onChange={handleBoardChange}
            />
          </section>
        )}

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
                {trimmedDescription.length}/{MAX_TEMPLATE_DESCRIPTION_LENGTH}
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
                onChange={handleCategoryChange}
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
                onChange={handleVisibilityChange}
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
                {trimmedCreditLine.length}/{MAX_TEMPLATE_CREDIT_LINE_LENGTH}
              </span>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--t-text-faint)]">
            Cover artwork
          </h3>
          {isEdit && (
            <p className="text-[11px] text-[var(--t-text-faint)]">
              {edit.hasCoverMedia
                ? 'Pick a new image to replace the current cover. Leave empty to keep it as is.'
                : 'Pick a new image to replace the item mosaic. Leave empty to keep the mosaic.'}
            </p>
          )}
          <CoverImageInput
            value={coverValue}
            onChange={handleCoverChange}
            onValidationError={setCoverError}
          />
          {isEdit && edit.hasCoverMedia && !coverValue && (
            <div className="flex flex-wrap items-center gap-2">
              <SecondaryButton
                type="button"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  setRemoveCover((current) =>
                  {
                    const next = !current
                    if (next) setCoverError(null)
                    return next
                  })
                }
              >
                <LayoutGrid className="h-3 w-3" strokeWidth={1.8} />
                {removeCover ? 'Keep current cover' : 'Use item mosaic'}
              </SecondaryButton>
              {removeCover && (
                <span className="text-[11px] text-[var(--t-text-muted)]">
                  Current cover will be removed.
                </span>
              )}
            </div>
          )}
          {coverError && (
            <p
              role="alert"
              className="text-xs text-[var(--t-destructive-hover)]"
            >
              {coverError}
            </p>
          )}
        </section>

        {error && (
          <p role="alert" className="text-xs text-[var(--t-destructive-hover)]">
            {error}
          </p>
        )}
      </div>

      <DialogActions className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--t-border)] bg-[var(--t-bg-overlay)] px-5 py-3">
        <SecondaryButton type="button" disabled={isPending} onClick={onClose}>
          Cancel
        </SecondaryButton>
        <PrimaryButton type="submit" size="md" disabled={!canSubmit}>
          {isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              {isEdit ? 'Saving…' : 'Publishing…'}
            </>
          ) : isEdit ? (
            'Save changes'
          ) : (
            'Publish template'
          )}
        </PrimaryButton>
      </DialogActions>
    </form>
  )
}

export const PublishModal = ({
  open,
  onClose,
  onPublished,
  edit,
  initialBoardExternalId,
}: PublishModalProps) =>
{
  const titleId = useId()
  const isEdit = !!edit

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="flex w-full max-w-lg flex-col p-0"
      panelStyle={{
        maxHeight: 'min(720px, calc(100dvh - 4rem))',
        overflowY: 'hidden',
      }}
    >
      <div className="shrink-0 border-b border-[var(--t-border-secondary)] px-5 pt-5 pb-4">
        <ModalHeader titleId={titleId}>
          {isEdit ? 'Edit template' : 'Publish as template'}
        </ModalHeader>
        <p className="mt-1 text-sm text-[var(--t-text-muted)]">
          {isEdit
            ? 'Update gallery metadata. Items & tier suggestions stay as published.'
            : 'Strip the rankings & share your item set so others can fork it into their own tier list.'}
        </p>
      </div>

      <PublishForm
        onClose={onClose}
        onPublished={onPublished}
        edit={edit}
        initialBoardExternalId={initialBoardExternalId}
      />
    </BaseModal>
  )
}
