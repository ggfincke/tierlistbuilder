// src/features/marketplace/ui/template/TemplateStyleSwitcher.tsx
// pre-fork image-style (skin) switcher on the template hero; hidden for
// single-skin templates

import type { TemplateStyleOption } from '@tierlistbuilder/contracts/marketplace/template'
import { StylePicker } from '~/shared/ui/settings/StylePicker'

interface TemplateStyleSwitcherProps
{
  styles: readonly TemplateStyleOption[]
  activeExternalId: string
  onChange: (styleExternalId: string) => void
}

export const TemplateStyleSwitcher = ({
  styles,
  activeExternalId,
  onChange,
}: TemplateStyleSwitcherProps) =>
{
  if (styles.length <= 1) return null
  return (
    <div className="mt-4 max-w-xl">
      <p
        id="template-style-switcher-label"
        className="mb-1.5 text-xs font-medium text-[var(--t-text-muted)]"
      >
        Image style
      </p>
      <StylePicker
        options={styles}
        value={activeExternalId}
        onChange={onChange}
        ariaLabelledby="template-style-switcher-label"
      />
    </div>
  )
}
