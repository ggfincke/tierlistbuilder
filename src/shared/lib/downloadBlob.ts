// src/shared/lib/downloadBlob.ts
// browser download helpers — trigger an anchor click for a URL & a blob variant
// that owns the createObjectURL -> revoke lifecycle

export const triggerDownload = (url: string, filename: string): void =>
{
  const anchor = document.createElement('a')
  anchor.download = filename
  anchor.href = url
  anchor.click()
}

export const downloadBlob = (blob: Blob, filename: string): void =>
{
  const url = URL.createObjectURL(blob)
  try
  {
    triggerDownload(url, filename)
  }
  finally
  {
    URL.revokeObjectURL(url)
  }
}
