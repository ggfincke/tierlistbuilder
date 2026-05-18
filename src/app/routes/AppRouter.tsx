// src/app/routes/AppRouter.tsx
// react-router-dom v6 router — workspace, library, embed, & 404 routes

import { Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { lazyNamed } from '~/shared/lib/lazyNamed'
import {
  BOARDS_ROUTE_PATH,
  EMBED_ROUTE_PATH,
  RANKINGS_ROUTE_PATH,
  TEMPLATES_ROUTE_PATH,
  normalizeBasePath,
} from '~/shared/routes/pathname'
import { AppChromeLayout } from '~/app/routes/AppChromeLayout'
import { ErrorBoundary } from '~/shared/ui/ErrorBoundary'
import { NotFoundRoute } from '~/app/routes/NotFoundRoute'
import { WorkspaceRoute } from '~/app/routes/WorkspaceRoute'

// embed bundle ships shared/board-ui + EmbedView which workspace users never
// hit — lazy load keeps it out of the primary chunk
const EmbedRoute = lazyNamed(() => import('./EmbedRoute'), 'EmbedRoute')

const MyBoardsRoute = lazyNamed(
  () => import('./MyBoardsRoute'),
  'MyBoardsRoute'
)

const MarketplaceLayout = lazyNamed(
  () => import('~/features/marketplace/pages/MarketplaceLayout'),
  'MarketplaceLayout'
)

const TemplatesGalleryPage = lazyNamed(
  () => import('~/features/marketplace/pages/TemplatesGalleryPage'),
  'TemplatesGalleryPage'
)

const TemplateDetailPage = lazyNamed(
  () => import('~/features/marketplace/pages/TemplateDetailPage'),
  'TemplateDetailPage'
)

const TemplateComparePage = lazyNamed(
  () => import('~/features/marketplace/pages/TemplateComparePage'),
  'TemplateComparePage'
)

const RankingDetailPage = lazyNamed(
  () => import('~/features/marketplace/pages/RankingDetailPage'),
  'RankingDetailPage'
)

const RankingsIndexPage = lazyNamed(
  () => import('~/features/marketplace/pages/RankingsIndexPage'),
  'RankingsIndexPage'
)

// matches the page-color shell each lazy chunk applies once mounted, so users
// don't see a white flash while the JS arrives
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
        <Route
          path={TEMPLATES_ROUTE_PATH}
          element={
            <ErrorBoundary section="templates">
              <Suspense fallback={<RouteFallback />}>
                <MarketplaceLayout />
              </Suspense>
            </ErrorBoundary>
          }
        >
          <Route index element={<TemplatesGalleryPage />} />
          <Route path=":slug" element={<TemplateDetailPage />} />
          <Route path=":slug/compare" element={<TemplateComparePage />} />
        </Route>
        <Route
          path={RANKINGS_ROUTE_PATH}
          element={
            <ErrorBoundary section="rankings">
              <Suspense fallback={<RouteFallback />}>
                <MarketplaceLayout />
              </Suspense>
            </ErrorBoundary>
          }
        >
          <Route index element={<RankingsIndexPage />} />
          <Route path=":slug" element={<RankingDetailPage />} />
        </Route>
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
