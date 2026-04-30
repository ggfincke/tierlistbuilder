// src/shared/lib/platform.ts
// browser platform detection helpers for shortcut labels

const detectPlatform = (): string =>
{
  if (typeof navigator === 'undefined') return ''
  const uaData = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData
  return uaData?.platform ?? navigator.platform ?? ''
}

export const IS_MAC = detectPlatform().toLowerCase().startsWith('mac')
