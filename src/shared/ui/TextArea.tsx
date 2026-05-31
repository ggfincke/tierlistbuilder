// src/shared/ui/TextArea.tsx
// shared multi-line text input primitive — mirrors TextInput's variant &
// size options so surfaces w/ mixed text inputs share one visual language

import { forwardRef, type TextareaHTMLAttributes } from 'react'

import {
  TEXT_FIELD_RADIUS_CLASS,
  TEXT_FIELD_SIZE_CLASS,
  TEXT_FIELD_VARIANT_CLASS,
  type TextFieldSize,
  type TextFieldVariant,
} from '~/shared/ui/textFieldChrome'

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>
{
  size?: TextFieldSize
  variant?: TextFieldVariant
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className = '', size = 'sm', variant = 'surface', ...props }, ref) => (
    <textarea
      ref={ref}
      className={`focus-custom min-w-0 outline-none disabled:cursor-not-allowed disabled:opacity-50 ${TEXT_FIELD_RADIUS_CLASS[variant]} ${TEXT_FIELD_SIZE_CLASS[size]} ${TEXT_FIELD_VARIANT_CLASS[variant]} ${className}`}
      {...props}
    />
  )
)

TextArea.displayName = 'TextArea'
