// src/features/marketplace/model/useTemplateDetail.ts
// model facade for the template-detail query — keeps page .tsx files from
// importing data adapters directly per the slice boundary rule

export {
  useTemplateBySlug,
  useRelatedTemplates,
} from '~/features/marketplace/data/templatesRepository'
