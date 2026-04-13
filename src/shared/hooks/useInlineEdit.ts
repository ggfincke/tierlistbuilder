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

type InlineEditInputProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'value' | 'size'
>

export const useInlineEdit = <TId extends string>({
  onCommit,
  normalizeValue = (value) => value.trim(),
}: UseInlineEditOptions<TId>) =>
{
  const [editing, setEditing] = useState<EditingState<TId> | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
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
    (event: KeyboardEvent<HTMLInputElement>) =>
    {
      if (event.key === 'Enter')
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
    ({ onBlur, onChange, onKeyDown, ...props }: InlineEditInputProps = {}) => ({
      ...props,
      value: editValue,
      onChange: (event: ChangeEvent<HTMLInputElement>) =>
      {
        onChange?.(event)
        setEditValue(event.target.value)
      },
      onBlur: (event: FocusEvent<HTMLInputElement>) =>
      {
        onBlur?.(event)
        handleBlur()
      },
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) =>
      {
        onKeyDown?.(event)

        if (event.defaultPrevented)
        {
          return
        }

        handleKeyDown(event)
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
