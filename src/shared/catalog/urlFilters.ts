// src/shared/catalog/urlFilters.ts
// shared URL filter parsing, writing, & React Router synchronization helpers

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams, type SetURLSearchParams } from 'react-router-dom'

export type SearchParamUpdateOptions = Parameters<SetURLSearchParams>[1]

export const isStringMember = <T extends string>(
  value: string | null,
  values: readonly T[]
): value is T => typeof value === 'string' && values.includes(value as T)

export const readSearchParam = (value: string | null): string =>
  typeof value === 'string' ? value : ''

export const writeSearchParam = (
  params: URLSearchParams,
  key: string,
  value: string
): void =>
{
  if (value.trim())
  {
    params.set(key, value)
    return
  }
  params.delete(key)
}

export const writeOptionalParam = (
  params: URLSearchParams,
  key: string,
  value: string | null
): void =>
{
  if (value)
  {
    params.set(key, value)
    return
  }
  params.delete(key)
}

export const writeDefaultedParam = <T extends string>(
  params: URLSearchParams,
  key: string,
  value: T,
  defaultValue: T
): void =>
{
  if (value === defaultValue)
  {
    params.delete(key)
    return
  }
  params.set(key, value)
}

export const createPatchedSearchParams = <TFilters>(
  current: URLSearchParams,
  patch: Partial<TFilters>,
  parse: (params: URLSearchParams) => TFilters,
  write: (params: URLSearchParams, filters: TFilters) => void
): URLSearchParams =>
{
  const nextFilters = {
    ...parse(current),
    ...patch,
  }
  const next = new URLSearchParams(current)
  write(next, nextFilters)
  return next
}

interface UseUrlFilterParamsOptions<TFilters extends { search: string }>
{
  debounceMs: number
  parse: (params: URLSearchParams) => TFilters
  create: (
    current: URLSearchParams,
    patch: Partial<TFilters>
  ) => URLSearchParams
}

export const useUrlFilterParams = <TFilters extends { search: string }>({
  debounceMs,
  parse,
  create,
}: UseUrlFilterParamsOptions<TFilters>) =>
{
  const [params, setParams] = useSearchParams()
  const filters = parse(params)
  const [searchDebounced, setSearchDebounced] = useState(filters.search.trim())
  const paramsKey = params.toString()

  const commitFilters = useCallback(
    (patch: Partial<TFilters>, options?: SearchParamUpdateOptions) =>
    {
      const next = create(params, patch)
      if (next.toString() !== params.toString())
      {
        setParams(next, options)
      }
    },
    [create, params, setParams]
  )

  useEffect(() =>
  {
    const next = create(params, {})
    if (next.toString() !== paramsKey)
    {
      setParams(next, { replace: true })
    }
  }, [create, params, paramsKey, setParams])

  useEffect(() =>
  {
    const nextSearch = filters.search.trim()
    if (searchDebounced === nextSearch) return
    const timeout = window.setTimeout(() =>
    {
      setSearchDebounced(nextSearch)
    }, debounceMs)
    return () =>
    {
      window.clearTimeout(timeout)
    }
  }, [debounceMs, filters.search, searchDebounced])

  return { filters, searchDebounced, commitFilters }
}
