// convex/lib/hexColor.ts
// runtime hex-color validator — v.string() has no regex/length constraint, so fields like
// backgroundOverride are validated in the handler. keeps format & error shape consistent

import { ConvexError } from 'convex/values'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'

// canonical #rrggbb hex form. clients normalize via ColorInput which
// outputs lowercase 6-char hex w/ leading # — reject anything else so a
// malformed value can't slip past & break the downstream color parser
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

export const validateHexColor = (value: string, fieldName: string): void =>
{
  if (!HEX_COLOR_PATTERN.test(value))
  {
    throw new ConvexError({
      code: CONVEX_ERROR_CODES.invalidInput,
      message: `${fieldName} must be a #rrggbb hex color`,
    })
  }
}
