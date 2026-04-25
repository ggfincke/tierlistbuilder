// src/shared/lib/logger.ts
// scoped console wrapper — single seam for future sentry/axiom swap

type Scope = string
type LogFn = (scope: Scope, message: string, ...data: unknown[]) => void

export interface Logger
{
  error: LogFn
  warn: LogFn
  info: LogFn
  debug: LogFn
}

const isDev = import.meta.env.DEV

export const logger: Logger = {
  error: (scope, message, ...data) =>
    console.error(`[${scope}]`, message, ...data),
  warn: (scope, message, ...data) =>
    console.warn(`[${scope}]`, message, ...data),
  info: (scope, message, ...data) =>
    console.info(`[${scope}]`, message, ...data),
  debug: (scope, message, ...data) =>
  {
    if (!isDev) return
    console.debug(`[${scope}]`, message, ...data)
  },
}
