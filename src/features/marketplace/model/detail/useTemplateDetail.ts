// src/features/marketplace/model/detail/useTemplateDetail.ts
// model facade for template-detail & owner management queries — keeps page
// .tsx files from importing data adapters directly per the slice boundary rule

export {
  useTemplateBySlug,
  useRelatedTemplates,
  useTemplateBookmarkState,
  useToggleTemplateBookmarkMutation,
} from '~/features/marketplace/data/templatesRepository'
