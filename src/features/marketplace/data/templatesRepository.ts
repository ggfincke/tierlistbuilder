// src/features/marketplace/data/templatesRepository.ts
// Convex query/mutation adapters for the public template marketplace

import { useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type {
  MarketplaceTemplateDetail,
  MarketplaceTemplateDraftListResult,
  MarketplaceTemplateListResult,
  MarketplaceTemplatePublishResult,
  MarketplaceTemplateUseResult,
  TemplateCategory,
  TemplateListSort,
  TemplateUseTierSelection,
  TemplateVisibility,
} from '@tierlistbuilder/contracts/marketplace/template'

export interface ListTemplatesArgs
{
  search?: string | null
  category?: TemplateCategory | null
  // canonical lowercase tag — server normalizes & null-coerces over-length
  // values so the gallery falls back to the unfiltered listing path
  tag?: string | null
  sort?: TemplateListSort
  limit?: number
}

// reactive list query — pass undefined to skip until inputs settle. caller
// receives `undefined` while loading & a populated list once Convex resolves
export const useListTemplates = (
  args: ListTemplatesArgs | 'skip'
): MarketplaceTemplateListResult | undefined =>
  useQuery(
    api.marketplace.templates.queries.listTemplates,
    args === 'skip' ? 'skip' : args
  )

// reactive detail query — slug-keyed; null when no template matches
export const useTemplateBySlug = (
  slug: string | null | undefined
): MarketplaceTemplateDetail | null | undefined =>
  useQuery(
    api.marketplace.templates.queries.getTemplateBySlug,
    typeof slug === 'string' && slug.length > 0 ? { slug } : 'skip'
  )

export interface RelatedTemplatesArgs
{
  slug: string
  limit?: number
}

// fed by the detail-page footer rail. category is derived server-side from
// the slug so the rail stays correct even if the parent detail row mutates
export const useRelatedTemplates = (
  args: RelatedTemplatesArgs | 'skip'
): MarketplaceTemplateListResult | undefined =>
  useQuery(
    api.marketplace.templates.queries.getRelatedTemplates,
    args === 'skip' ? 'skip' : args
  )

export const useMyTemplates = (
  enabled: boolean
): MarketplaceTemplateListResult | undefined =>
  useQuery(
    api.marketplace.templates.queries.getMyTemplates,
    enabled ? {} : 'skip'
  )

export const useMyTemplateDrafts = (
  enabled: boolean,
  limit?: number
): MarketplaceTemplateDraftListResult | undefined =>
  useQuery(
    api.marketplace.templates.queries.getMyTemplateDrafts,
    enabled ? (limit === undefined ? {} : { limit }) : 'skip'
  )

export interface PublicTemplateCount
{
  count: number
  // sparse — only categories w/ at least one public template are present.
  // keyed by TemplateCategory string (kept loose so taxonomy churn stays
  // additive on the wire). callers should fall back to 0 for missing keys
  countByCategory: Record<string, number>
  isCapped: boolean
}

// bounded count used by the gallery eyebrow & per-category chips. resolves
// once on mount & re-runs reactively when templates are published /
// unpublished / re-categorized
export const usePublicTemplateCount = (): PublicTemplateCount | undefined =>
  useQuery(api.marketplace.templates.queries.getPublicTemplateCount, {})

export interface PublishFromBoardArgs
{
  boardExternalId: string
  title: string
  description: string | null
  category: TemplateCategory
  tags: string[]
  visibility: TemplateVisibility
  coverMediaExternalId: string | null
  creditLine: string | null
}

export const usePublishFromBoardMutation = () =>
  useMutation(
    api.marketplace.templates.mutations.publishFromBoard
  ) as unknown as (
    args: PublishFromBoardArgs
  ) => Promise<MarketplaceTemplatePublishResult>

export interface UseTemplateMutationArgs
{
  slug: string
  title?: string
  tierSelection?: TemplateUseTierSelection
}

export const useUseTemplateMutation = () =>
  useMutation(api.marketplace.templates.mutations.useTemplate) as unknown as (
    args: UseTemplateMutationArgs
  ) => Promise<MarketplaceTemplateUseResult>
