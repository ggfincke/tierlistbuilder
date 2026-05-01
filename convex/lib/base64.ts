// convex/lib/base64.ts
// server-side base64 codec — mirrors src/shared/lib/binaryCodec.ts. exists as
// a separate file because Convex's V8 runtime can't import from src/

export const base64ToBytes = (base64: string): Uint8Array =>
{
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++)
  {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
