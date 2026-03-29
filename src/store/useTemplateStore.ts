// src/store/useTemplateStore.ts
// user-saved board templates — persisted independently of boards & settings

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { TierTemplate } from '../types'
import { createAppPersistStorage } from '../utils/storage'

export const TEMPLATE_STORAGE_KEY = 'tier-list-builder-templates'

interface TemplateStore
{
  userTemplates: TierTemplate[]
  addTemplate: (template: TierTemplate) => void
  removeTemplate: (templateId: string) => void
  renameTemplate: (templateId: string, name: string) => void
}

export const useTemplateStore = create<TemplateStore>()(
  persist(
    (set) => ({
      userTemplates: [],

      addTemplate: (template) =>
        set((state) => ({
          userTemplates: [...state.userTemplates, template],
        })),

      removeTemplate: (templateId) =>
        set((state) => ({
          userTemplates: state.userTemplates.filter((t) => t.id !== templateId),
        })),

      renameTemplate: (templateId, name) =>
        set((state) => ({
          userTemplates: state.userTemplates.map((t) =>
            t.id === templateId ? { ...t, name: name.trim() || t.name } : t
          ),
        })),
    }),
    {
      name: TEMPLATE_STORAGE_KEY,
      storage: createAppPersistStorage(),
      version: 1,
    }
  )
)
