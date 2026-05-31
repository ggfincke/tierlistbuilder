// scripts/lib/formatBytes.mjs
// byte-size formatter shared by repo maintenance scripts

export const formatBytes = (bytes, { unit = 'auto' } = {}) =>
{
  if (unit === 'mb') return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} kB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
