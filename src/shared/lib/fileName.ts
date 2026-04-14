// src/shared/lib/fileName.ts
// shared file-name helpers for exportable assets

// convert a board title to a URL-safe filename base
export const toFileBase = (title: string): string =>
{
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'tier-list'
}
