// src/shared/lib/sha256.ts
// browser sha256 helpers plus Blob adapter

import { sha256Hex } from '@tierlistbuilder/contracts/lib/sha256'

export { sha256Hex } from '@tierlistbuilder/contracts/lib/sha256'

// compute the sha256 of a Blob by reading its bytes. Blob.arrayBuffer() is
// widely supported & avoids pulling the whole file through a FileReader
export const sha256HexFromBlob = async (blob: Blob): Promise<string> =>
{
  const buffer = await blob.arrayBuffer()
  return sha256Hex(buffer)
}
