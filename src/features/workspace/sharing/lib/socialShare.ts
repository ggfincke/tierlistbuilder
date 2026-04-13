// src/features/workspace/sharing/lib/socialShare.ts
// social sharing utilities — Twitter/X intent & Web Share API

// open a Twitter/X compose window w/ pre-filled text & URL
export const shareToTwitter = (text: string, url: string): void =>
{
  const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
  window.open(intentUrl, '_blank', 'noopener,noreferrer')
}

// use the Web Share API if available (mobile browsers, some desktops)
export const shareViaWebShareApi = async (
  title: string,
  text: string,
  url: string
): Promise<boolean> =>
{
  if (!('share' in navigator))
  {
    return false
  }

  try
  {
    await navigator.share({ title, text, url })
    return true
  }
  catch
  {
    // user cancelled or share failed — not an error
    return false
  }
}
