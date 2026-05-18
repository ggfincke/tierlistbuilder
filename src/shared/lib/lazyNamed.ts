// src/shared/lib/lazyNamed.ts
// React.lazy adapter for code-split modules that expose named components

import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

type LazyComponent<TModule, TName extends keyof TModule> =
  TModule[TName] extends ComponentType<infer TProps>
    ? ComponentType<TProps>
    : never

export const lazyNamed = <TModule, TName extends keyof TModule>(
  loader: () => Promise<TModule>,
  name: TName
): LazyExoticComponent<LazyComponent<TModule, TName>> =>
  lazy(async () =>
  {
    const module = await loader()
    return {
      default: module[name] as LazyComponent<TModule, TName>,
    }
  })
