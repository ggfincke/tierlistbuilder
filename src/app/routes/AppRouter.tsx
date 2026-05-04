// src/app/routes/AppRouter.tsx
// react-router-dom v6 router — workspace, library, embed, & 404 routes

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

const MyListsRoute = lazy(() =>
  import('./MyListsRoute').then((m) => ({ default: m.MyListsRoute }))
)

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
          path={BOARDS_ROUTE_PATH}
          element={
            <ErrorBoundary section="my lists">
              <Suspense fallback={<RouteFallback />}>
                <MyListsRoute />
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
