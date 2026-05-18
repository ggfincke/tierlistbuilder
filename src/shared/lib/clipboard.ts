// src/shared/lib/clipboard.ts
// browser clipboard helpers w/ native API plus textarea fallback

export const copyTextToClipboard = async (value: string): Promise<boolean> =>
{
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText)
  {
    try
    {
      await navigator.clipboard.writeText(value)
      return true
    }
    catch
    {
      // fall through to textarea copy
    }
  }

  if (typeof document === 'undefined') return false

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  try
  {
    return document.execCommand('copy')
  }
  catch
  {
    return false
  }
  finally
  {
    document.body.removeChild(textarea)
  }
}
