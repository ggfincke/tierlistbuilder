// src/shared/catalog/urlFilters.ts
// shared URL filter parsing, writing, & React Router synchronization helpers

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams, type SetURLSearchParams } from 'react-router-dom'

type SearchParamUpdateOptions = Parameters<SetURLSearchParams>[1]

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
  const paramsKey = params.toString()
  // memo on the serialized URL so consumers see a stable filters reference
  // when the URL string is unchanged. parsing from a fresh URLSearchParams
  // built off paramsKey keeps the dep list aligned w/ what's actually read
  const filters = useMemo(
    () => parse(new URLSearchParams(paramsKey)),
    [parse, paramsKey]
  )
  const [searchDebounced, setSearchDebounced] = useState(filters.search.trim())

  const commitFilters = useCallback(
    (patch: Partial<TFilters>, options?: SearchParamUpdateOptions) =>
    {
      const next = create(params, patch)
      if (next.toString() !== paramsKey)
      {
        setParams(next, options)
      }
    },
    [create, params, paramsKey, setParams]
  )

  // canonicalize the URL when the serialized key changes. body short-circuits
  // when create() yields the same string so the steady state stays cheap
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

type CommitFilters<TFilters> = (
  patch: Partial<TFilters>,
  options?: SearchParamUpdateOptions
) => void

type FilterSetters<TFilters> = {
  [K in keyof TFilters]: (next: TFilters[K]) => void
}

// build memoized single-field setters from commitFilters. the per-key options
// bag opts a setter into replace-instead-of-push history (e.g. search input)
export const useFilterSetters = <TFilters extends object>(
  commitFilters: CommitFilters<TFilters>,
  optionsByKey: { [K in keyof TFilters]?: SearchParamUpdateOptions }
): FilterSetters<TFilters> =>
  useMemo(() =>
  {
    const setters = {} as FilterSetters<TFilters>
    for (const key of Object.keys(optionsByKey) as (keyof TFilters)[])
    {
      const options = optionsByKey[key]
      setters[key] = (next) =>
        commitFilters({ [key]: next } as Partial<TFilters>, options)
    }
    return setters
  }, [commitFilters, optionsByKey])
