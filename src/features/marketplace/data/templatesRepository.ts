// src/features/marketplace/data/templatesRepository.ts
// Convex query/mutation adapters for the public template marketplace

import { useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type {
  MarketplaceTemplateDetail,
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

export const useMyTemplates = (
  enabled: boolean
): MarketplaceTemplateListResult | undefined =>
  useQuery(
    api.marketplace.templates.queries.getMyTemplates,
    enabled ? {} : 'skip'
  )

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
