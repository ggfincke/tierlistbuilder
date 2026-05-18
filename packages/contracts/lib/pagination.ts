// packages/contracts/lib/pagination.ts
// shared Convex pagination result envelope for contract result types

export interface PaginationResult<T>
{
  page: T[]
  continueCursor: string
  isDone: boolean
  splitCursor?: string | null
  pageStatus?: 'SplitRecommended' | 'SplitRequired' | null
}
