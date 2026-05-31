// src/features/marketplace/data/queryArgs.ts
// small guards for optional Convex query args in marketplace repositories

import { isNonEmptyString } from '~/shared/lib/typeGuards'

export const shouldRunSlugQuery = (
  slug: unknown,
  enabled = true
): slug is string => enabled && isNonEmptyString(slug)

export const optionalStringArg = <Key extends string>(
  key: Key,
  value: string | null | undefined
): Partial<Record<Key, string>> =>
  isNonEmptyString(value) ? ({ [key]: value } as Record<Key, string>) : {}

export const optionalLimitArg = (
  limit: number | undefined
): { limit?: number } =>
  typeof limit === 'number' && Number.isFinite(limit) ? { limit } : {}
