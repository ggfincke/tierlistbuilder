// src/shared/ui/TextInput.tsx
// shared text input primitive for surfaced & inline text-entry fields

import { forwardRef, type InputHTMLAttributes } from 'react'

import {
  TEXT_FIELD_VARIANT_CLASS,
  TEXT_INPUT_SIZE_CLASS,
  type TextFieldSize,
  type TextFieldVariant,
} from '~/shared/ui/textFieldChrome'

interface TextInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size'
>
{
  size?: TextFieldSize
  variant?: TextFieldVariant
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      className = '',
      size = 'sm',
      type = 'text',
      variant = 'surface',
      ...props
    },
    ref
  ) => (
      <input
      ref={ref}
      type={type}
      className={`focus-custom min-w-0 rounded-md outline-none disabled:cursor-not-allowed disabled:opacity-50 ${TEXT_INPUT_SIZE_CLASS[size]} ${TEXT_FIELD_VARIANT_CLASS[variant]} ${className}`}
      {...props}
    />
  )
)

TextInput.displayName = 'TextInput'
