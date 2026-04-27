// packages/contracts/lib/hexColor.ts
// shared #rrggbb color guard for frontend & backend validation

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX_COLOR_PATTERN.test(value)
