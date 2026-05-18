// src/app/routes/AppRouter.tsx
// react-router-dom v6 router — workspace, library, embed, & 404 routes

import { Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { lazyNamed } from '~/shared/lib/lazyNamed'
import {
  BOARDS_ROUTE_PATH,
  EMBED_ROUTE_PATH,
  normalizeBasePath,
} from '~/shared/routes/pathname'
import { AppChromeLayout } from './AppChromeLayout'
import { ErrorBoundary } from '~/shared/ui/ErrorBoundary'
import { NotFoundRoute } from './NotFoundRoute'
import { WorkspaceRoute } from './WorkspaceRoute'

const EmbedRoute = lazyNamed(() => import('./EmbedRoute'), 'EmbedRoute')

const MyBoardsRoute = lazyNamed(
  () => import('./MyBoardsRoute'),
  'MyBoardsRoute'
)

const RouteFallback = () => (
  <main className="min-h-screen bg-[var(--t-bg-page)]" />
)

const routerBasename = normalizeBasePath() || '/'

export const AppRouter = () => (
  <BrowserRouter
    basename={routerBasename}
    future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
  >
    <Routes>
      <Route element={<AppChromeLayout />}>
        <Route
          path="/"
          element={
            <ErrorBoundary section="the application">
              <WorkspaceRoute />
            </ErrorBoundary>
          }
        />
        <Route
          path={BOARDS_ROUTE_PATH}
          element={
            <ErrorBoundary section="my boards">
              <Suspense fallback={<RouteFallback />}>
                <MyBoardsRoute />
              </Suspense>
            </ErrorBoundary>
          }
        />
        <Route path="*" element={<NotFoundRoute />} />
      </Route>
      <Route
        path={EMBED_ROUTE_PATH}
        element={
          <ErrorBoundary section="embedded board">
            <Suspense fallback={<RouteFallback />}>
              <EmbedRoute />
            </Suspense>
          </ErrorBoundary>
        }
      />
    </Routes>
  </BrowserRouter>
)
