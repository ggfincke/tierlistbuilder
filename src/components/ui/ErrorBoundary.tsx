// src/components/ui/ErrorBoundary.tsx
// generic React error boundary — catches render errors & shows fallback UI

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps
{
  children: ReactNode
  // label for the section this boundary wraps (shown in fallback)
  section?: string
  // optional custom fallback renderer
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface ErrorBoundaryState
{
  error: Error | null
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
>
{
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState
  {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void
  {
    console.error(
      `[ErrorBoundary${this.props.section ? `: ${this.props.section}` : ''}]`,
      error,
      info.componentStack
    )
  }

  handleReset = () =>
  {
    this.setState({ error: null })
  }

  render()
  {
    const { error } = this.state
    const { children, section, fallback } = this.props

    if (error)
    {
      if (fallback)
      {
        return fallback(error, this.handleReset)
      }

      return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-[color-mix(in_srgb,var(--t-destructive)_60%,transparent)] bg-[color-mix(in_srgb,var(--t-destructive)_8%,transparent)] px-6 py-8">
          <p className="text-sm font-medium text-[color-mix(in_srgb,var(--t-destructive)_30%,var(--t-text))]">
            {section
              ? `Something went wrong in ${section}.`
              : 'Something went wrong.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-4 py-1.5 text-sm text-[var(--t-text-secondary)] transition-colors hover:bg-[var(--t-bg-hover)]"
          >
            Try again
          </button>
        </div>
      )
    }

    return children
  }
}
