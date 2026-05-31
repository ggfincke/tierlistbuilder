// packages/contracts/lib/sha256.ts
// sha256 hex helpers shared by browser & Convex runtimes

export const bytesToHex = (bytes: Uint8Array): string =>
{
  let hex = ''
  for (let i = 0; i < bytes.length; i++)
  {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

type Sha256Input = ArrayBuffer | ArrayBufferView

interface Sha256RuntimeCrypto
{
  subtle: {
    digest: (algorithm: string, data: Sha256Input) => Promise<ArrayBuffer>
  }
}

const runtimeCrypto = (): Sha256RuntimeCrypto =>
  (globalThis as typeof globalThis & { crypto: Sha256RuntimeCrypto }).crypto

export const sha256Hex = async (bytes: Sha256Input): Promise<string> =>
{
  const digest = await runtimeCrypto().subtle.digest('SHA-256', bytes)
  return bytesToHex(new Uint8Array(digest))
}
