// src/app/routes/AppRouter.tsx
// react-router-dom v6 router — workspace, marketplace, embed, & 404 routes

import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import {
  BOARDS_ROUTE_PATH,
  EMBED_ROUTE_PATH,
  TEMPLATES_ROUTE_PATH,
  normalizeBasePath,
} from '~/shared/routes/pathname'
import { AppChromeLayout } from './AppChromeLayout'
import { ErrorBoundary } from '~/shared/ui/ErrorBoundary'
import { NotFoundRoute } from './NotFoundRoute'
import { WorkspaceRoute } from './WorkspaceRoute'

// embed bundle ships shared/board-ui + EmbedView which workspace users never
// hit — lazy load keeps it out of the primary chunk
const EmbedRoute = lazy(() =>
  import('./EmbedRoute').then((m) => ({ default: m.EmbedRoute }))
)

// marketplace pages share a slice bundle that workspace users only fetch when
// they navigate to marketplace-adjacent routes
const MarketplaceLayout = lazy(() =>
  import('~/features/marketplace/pages/MarketplaceLayout').then((m) => ({
    default: m.MarketplaceLayout,
  }))
)
const TemplatesGalleryPage = lazy(() =>
  import('~/features/marketplace/pages/TemplatesGalleryPage').then((m) => ({
    default: m.TemplatesGalleryPage,
  }))
)
const TemplateDetailPage = lazy(() =>
  import('~/features/marketplace/pages/TemplateDetailPage').then((m) => ({
    default: m.TemplateDetailPage,
  }))
)
const MyListsRoute = lazy(() =>
  import('./MyListsRoute').then((m) => ({ default: m.MyListsRoute }))
)

// matches the page-color shell each lazy chunk applies once mounted, so users
// don't see a white flash while the JS arrives
const RouteFallback = () => (
  <main className="min-h-screen bg-[var(--t-bg-page)]" />
)

// react-router-dom 6 expects an absolute basename. BASE_URL defaults to '/'
// when no Vite base is configured; normalizeBasePath() strips the trailing
// slash for non-root deploys & returns '' at root, which we map back to '/'
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
          element={
            <ErrorBoundary section="marketplace navigation">
              <Suspense fallback={<RouteFallback />}>
                <MarketplaceLayout />
              </Suspense>
            </ErrorBoundary>
          }
        >
          <Route path={TEMPLATES_ROUTE_PATH}>
            <Route index element={<TemplatesGalleryPage />} />
            <Route path=":slug" element={<TemplateDetailPage />} />
          </Route>
          <Route path={BOARDS_ROUTE_PATH} element={<MyListsRoute />} />
        </Route>
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
      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  </BrowserRouter>
)
