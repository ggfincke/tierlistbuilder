// convex/lib/seedContentHash.ts
// canonical seed content hash — sha256 over canonical JSON of {kind, payload},
// truncated to a versioned prefix.

// matches scripts/seed_pipeline/seed_pipeline/content_hash.py:seed_content_hash;
// both sides reference SEED_CONTENT_HASH_VERSION + SEED_CONTENT_HASH_HEX_LENGTH
// from the contracts package so drift would be a silent dedup bug.

import {
  SEED_CONTENT_HASH_HEX_LENGTH,
  SEED_CONTENT_HASH_VERSION,
} from '@tierlistbuilder/contracts/marketplace/seedPipeline'
import { sha256Hex } from './sha256'

// canonical JSON: sorted object keys, no whitespace, undefined values dropped.
// matches `json.dumps(..., sort_keys=True, separators=(",", ":"), ensure_ascii=False)`
// in Python — payloads we hash never carry undefined values.
const stableStringify = (value: unknown): string =>
{
  if (value === null || typeof value !== 'object')
  {
    return JSON.stringify(value) ?? 'undefined'
  }
  if (Array.isArray(value))
  {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
  return `{${entries.join(',')}}`
}

export const seedContentHash = async (
  kind: string,
  payload: unknown
): Promise<string> =>
{
  const serialized = stableStringify({ kind, payload })
  const digest = await sha256Hex(new TextEncoder().encode(serialized))
  return `${SEED_CONTENT_HASH_VERSION}:${digest.slice(0, SEED_CONTENT_HASH_HEX_LENGTH)}`
}
