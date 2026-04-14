// src/shared/hooks/useInlineEdit.ts
// shared inline-edit controller for focus, draft state, & commit/cancel keys

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'

type InlineEditElement = HTMLInputElement | HTMLTextAreaElement

type InlineEditInputTagName = 'input' | 'textarea'

type InlineEditElementForTag<TTag extends InlineEditInputTagName> =
  TTag extends 'textarea' ? HTMLTextAreaElement : HTMLInputElement

interface EditingState<TId extends string>
{
  id: TId
  initialValue: string
}

interface UseInlineEditOptions<TId extends string>
{
  onCommit: (id: TId, value: string) => void
  normalizeValue?: (value: string) => string
}

type InlineEditInputProps<TTag extends InlineEditInputTagName> = Omit<
  ComponentPropsWithoutRef<TTag>,
  'value' | 'size'
>

export const useInlineEdit = <
  TId extends string,
  TTag extends InlineEditInputTagName = 'input',
>({
  onCommit,
  normalizeValue = (value) => value.trim(),
}: UseInlineEditOptions<TId>) =>
{
  type Element = InlineEditElementForTag<TTag>

  const [editing, setEditing] = useState<EditingState<TId> | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<Element | null>(null)
  const blurActionRef = useRef<'commit' | 'cancel' | null>(null)

  useEffect(() =>
  {
    if (!editing)
    {
      return
    }

    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const cancelEdit = useCallback(() =>
  {
    blurActionRef.current = null
    setEditing(null)
    setEditValue('')
  }, [])

  const commitEdit = useCallback(() =>
  {
    if (!editing)
    {
      return
    }

    const nextValue = normalizeValue(editValue)
    const initialValue = normalizeValue(editing.initialValue)

    if (nextValue && nextValue !== initialValue)
    {
      onCommit(editing.id, nextValue)
    }

    blurActionRef.current = null
    setEditing(null)
    setEditValue('')
  }, [editValue, editing, normalizeValue, onCommit])

  const startEdit = useCallback((id: TId, initialValue: string) =>
  {
    blurActionRef.current = null
    setEditing({ id, initialValue })
    setEditValue(initialValue)
  }, [])

  const handleBlur = useCallback(() =>
  {
    const blurAction = blurActionRef.current
    blurActionRef.current = null

    if (blurAction === 'cancel')
    {
      cancelEdit()
      return
    }

    commitEdit()
  }, [cancelEdit, commitEdit])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<InlineEditElement>) =>
    {
      // Enter commits unless this is a textarea & the user holds Shift to
      // insert a newline; Escape always cancels
      const isTextarea = event.currentTarget instanceof HTMLTextAreaElement

      if (event.key === 'Enter' && !(isTextarea && event.shiftKey))
      {
        event.preventDefault()
        blurActionRef.current = 'commit'
        event.currentTarget.blur()
      }

      if (event.key === 'Escape')
      {
        event.preventDefault()
        blurActionRef.current = 'cancel'
        event.currentTarget.blur()
      }
    },
    []
  )

  const getInputProps = useCallback(
    (
      {
        onBlur,
        onChange,
        onKeyDown,
        ...props
      }: InlineEditInputProps<TTag> = {} as InlineEditInputProps<TTag>
    ) => ({
      ...props,
      value: editValue,
      onChange: (event: ChangeEvent<Element>) =>
      {
        ;(onChange as ((e: ChangeEvent<Element>) => void) | undefined)?.(event)
        setEditValue(event.target.value)
      },
      onBlur: (event: FocusEvent<Element>) =>
      {
        ;(onBlur as ((e: FocusEvent<Element>) => void) | undefined)?.(event)
        handleBlur()
      },
      onKeyDown: (event: KeyboardEvent<Element>) =>
      {
        ;(onKeyDown as ((e: KeyboardEvent<Element>) => void) | undefined)?.(
          event
        )

        if (event.defaultPrevented)
        {
          return
        }

        handleKeyDown(event as KeyboardEvent<InlineEditElement>)
      },
    }),
    [editValue, handleBlur, handleKeyDown]
  )

  return {
    editValue,
    editingId: editing?.id ?? null,
    inputRef,
    cancelEdit,
    commitEdit,
    getInputProps,
    isEditing: (id: TId) => editing?.id === id,
    setEditValue,
    startEdit,
  }
}
