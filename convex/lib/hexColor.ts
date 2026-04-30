// convex/lib/hexColor.ts
// runtime hex-color validator for v.string() fields

import { ConvexError } from 'convex/values'
import { HEX_COLOR_PATTERN } from '@tierlistbuilder/contracts/lib/hexColor'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'

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
