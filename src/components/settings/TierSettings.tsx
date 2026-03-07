// src/components/settings/TierSettings.tsx
// settings panel — image import & tier management actions
import { useTierListStore } from '../../store/useTierListStore'
import { ImageUploader } from './ImageUploader'

interface TierSettingsProps {
  // controls panel visibility
  open: boolean
  // called when the user closes the panel
  onClose: () => void
}

export const TierSettings = ({ open, onClose }: TierSettingsProps) => {
  const addTier = useTierListStore((state) => state.addTier)

  // render nothing when closed to avoid mounting the uploader unnecessarily
  if (!open) {
    return null
  }

  return (
    <>
      {/* backdrop — click to close */}
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />

      <div className="fixed inset-0 z-50 m-auto flex max-h-[calc(100vh-4rem)] w-full max-w-2xl flex-col rounded-xl border border-[#444] bg-[#1e1e1e] p-4 shadow-2xl" style={{ height: 'fit-content' }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Tier Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#555] px-3 py-1 text-sm text-slate-200 hover:border-[#777]"
          >
            Done
          </button>
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          {/* image import section */}
          <section className="rounded-lg border border-[#444] bg-[#272727] p-3">
            <div className="mb-2">
              <h3 className="text-sm font-semibold text-slate-100">Import Images</h3>
              <p className="mt-1 text-xs text-[#999]">Drop files here or choose them from your computer.</p>
            </div>
            <ImageUploader />
          </section>

          {/* add a new tier row to the bottom of the board */}
          <button
            type="button"
            onClick={addTier}
            className="rounded-md border border-[#555] bg-[#2b2b2b] px-3 py-1.5 text-sm font-medium text-slate-200 hover:border-[#777] hover:bg-[#333]"
          >
            Add Tier
          </button>
        </div>
      </div>
    </>
  )
}
